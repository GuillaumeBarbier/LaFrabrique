/** Uploaded fonts' @font-face rules (React hoists the stylesheet into <head>). */
export function CustomFontsLink() {
  // A route handler's stylesheet (uploaded fonts change at runtime): not a static CSS import.
  // eslint-disable-next-line @next/next/no-css-tags
  return <link rel="stylesheet" href="/api/v1/fonts/custom.css" precedence="fonts" />;
}
