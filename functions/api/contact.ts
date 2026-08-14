export interface Env {
  RESEND_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
}): Promise<Response> => {
  try {
    const formData = await request.formData();
    const name = formData.get("name");
    const email = formData.get("email");
    const message = formData.get("message");

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "notification@haackr.com",
        to: "ryan@haackr.com",
        reply_to: email as string,
        template: {
          id: "new-contact",
          variables: {
            sender_name: name as string,
            sender_email: email as string,
            message: message as string,
          },
        },
      }),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to Send Email" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Ryan Haack <ryan@haackr.com>",
        to: email as string,
        reply_to: "ryan@haackr.com",
        template: {
          id: "contact-received",
          variables: {
            name: name as string,
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
        },
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to Send Email" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "Internal Server Error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
