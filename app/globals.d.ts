declare module "*.css";

// `<s-app-nav>` is a Polaris web component shipped with the current App
// Bridge / Shopify CLI app template, but it isn't yet declared in the
// published @shopify/polaris-types@1.0.1 package (verified: the pristine
// `shopify app init --template reactRouter` scaffold fails `tsc --noEmit`
// the same way). Remove this once polaris-types ships a real declaration.
declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}
