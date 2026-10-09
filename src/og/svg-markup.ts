import { Fragment, isValidElement, type ReactNode } from "react";

// Next refuses react-dom/server in a route handler: this turns a tree of SVG elements and plain function components
// (no hook, no context) into markup, as renderToStaticMarkup would, for an image's data URI.

/** Attributes whose SVG name keeps its capitals; every other camelCase prop becomes kebab-case (strokeWidth). */
const CAMEL_CASE_ATTRIBUTES: ReadonlySet<string> = new Set(["viewBox", "preserveAspectRatio"]);

const SKIPPED_PROPS: ReadonlySet<string> = new Set(["children", "key", "className"]);

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function attributeName(prop: string): string {
  return CAMEL_CASE_ATTRIBUTES.has(prop) ? prop : prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The markup of a tree of SVG elements; throws on anything else than elements, function components and text. */
export function svgMarkup(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return escapeXml(String(node));
  }
  if (Array.isArray(node)) {
    return node.map(svgMarkup).join("");
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    throw new TypeError("svgMarkup renders elements, function components and text only");
  }
  const { type, props } = node;
  if (type === Fragment) {
    return svgMarkup(props.children as ReactNode);
  }
  if (typeof type === "function") {
    return svgMarkup((type as (props: Record<string, unknown>) => ReactNode)(props));
  }
  if (typeof type !== "string") {
    throw new TypeError("svgMarkup renders elements, function components and text only");
  }
  const attributes = Object.entries(props)
    .filter(([prop, value]) => !SKIPPED_PROPS.has(prop) && value !== undefined && value !== null && value !== false)
    .map(([prop, value]) => ` ${attributeName(prop)}="${escapeXml(String(value))}"`)
    .join("");
  const children = svgMarkup(props.children as ReactNode);
  return children === "" ? `<${type}${attributes}/>` : `<${type}${attributes}>${children}</${type}>`;
}
