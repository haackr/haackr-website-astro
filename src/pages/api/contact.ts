import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

interface CloudflareEnv {
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();

    // 1. Honeypot check: If the hidden _gotcha field is filled, silently return success
    const gotcha = formData.get("_gotcha");
    if (gotcha) {
      console.warn("Spam bot submission blocked via honeypot field.");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const name = (formData.get("name") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim();
    const message = (formData.get("message") as string | null)?.trim();

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email address format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const cfEnv = env as CloudflareEnv;
    const resendApiKey =
      cfEnv.RESEND_API_KEY ||
      (typeof process !== "undefined" ? process.env?.RESEND_API_KEY : undefined);
    const turnstileSecret =
      cfEnv.TURNSTILE_SECRET_KEY ||
      (typeof process !== "undefined" ? process.env?.TURNSTILE_SECRET_KEY : undefined);

    // 2. Cloudflare Turnstile Verification (if secret key is configured)
    if (turnstileSecret) {
      const turnstileToken = formData.get("cf-turnstile-response");

      if (!turnstileToken) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Please complete the CAPTCHA verification.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const clientIp =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("x-forwarded-for") ||
        undefined;

      const verifyFormData = new FormData();
      verifyFormData.append("secret", turnstileSecret);
      verifyFormData.append("response", turnstileToken as string);
      if (clientIp) {
        verifyFormData.append("remoteip", clientIp);
      }

      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: verifyFormData,
        }
      );

      const outcome = (await verifyRes.json()) as {
        success: boolean;
        "error-codes"?: string[];
      };

      if (!outcome.success) {
        console.error("Turnstile verification failed:", outcome["error-codes"]);
        return new Response(
          JSON.stringify({
            success: false,
            error: "CAPTCHA verification failed. Please try again.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set.");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Send Notification to Ryan
    let res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "notification@haackr.com",
        to: "ryan@haackr.com",
        reply_to: email,
        template: {
          id: "new-contact",
          variables: {
            name: "Ryan",
            sender_name: name,
            sender_email: email,
            message: message,
          },
        },
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      console.error("Resend API Error (Notification):", error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send message" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 4. Send Confirmation Auto-response to Sender
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Ryan Haack <ryan@haackr.com>",
        to: email,
        reply_to: "ryan@haackr.com",
        template: {
          id: "contact-received",
          variables: {
            name: name,
            sender_name: "Ryan",
          },
        },
      }),
    });

    if (res.ok) {
      return new Response(
        JSON.stringify({
          success: true,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      const error = await res.json();
      console.error("Resend API Error (Confirmation):", error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send confirmation email" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (err) {
    console.error("Contact API Exception:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal Server Error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

