/**
 * Calculates estimated reading time for markdown/text content based on average 200 wpm.
 */
export function calculateReadingTime(content: string | undefined | null): string {
  if (!content) return "1 min read";

  // Clean code blocks, JSX tags, and markdown symbols to get an accurate word count
  const cleanText = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`.*?`/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[#*_~]/g, "");

  const words = cleanText.trim().split(/\s+/).filter((w) => w.length > 0).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
}
