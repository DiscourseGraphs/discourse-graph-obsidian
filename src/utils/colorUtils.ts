import { DiscourseNode } from "~/types";

// Color palette similar to Roam's implementation
const COLOR_PALETTE: Record<string, string> = {
  black: "#1d1d1d",
  blue: "#4263eb",
  green: "#099268",
  grey: "#adb5bd",
  lightBlue: "#4dabf7",
  lightGreen: "#40c057",
  lightRed: "#ff8787",
  lightViolet: "#e599f7",
  orange: "#f76707",
  red: "#e03131",
  violet: "#ae3ec9",
  white: "#ffffff",
  yellow: "#ffc078",
};

const COLOR_ARRAY = Object.keys(COLOR_PALETTE);

// TODO switch to colord - https://linear.app/discourse-graphs/issue/ENG-836/button-like-css-styling-for-node-tag
export const getContrastColor = (bgColor: string): string => {
  const hex = bgColor.replace("#", "");

  if (hex.length !== 6) return "#000000";

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#000000";

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? "#000000" : "#ffffff";
};

export const getNodeTagColors = (
  nodeType: DiscourseNode,
  nodeIndex: number,
): { backgroundColor: string; textColor: string } => {
  const customColor = nodeType.color || "";

  const safeIndex =
    nodeIndex >= 0 && nodeIndex < COLOR_ARRAY.length ? nodeIndex : 0;
  const paletteColorKey = COLOR_ARRAY[safeIndex];
  const paletteColor = paletteColorKey
    ? COLOR_PALETTE[paletteColorKey]
    : COLOR_PALETTE.blue;

  const backgroundColor = customColor || paletteColor || "#4263eb";
  const textColor = getContrastColor(backgroundColor);

  return { backgroundColor, textColor };
};


export const getAllDiscourseNodeColors = (
  nodeTypes: DiscourseNode[],
): Array<{
  nodeType: DiscourseNode;
  colors: { backgroundColor: string; textColor: string };
}> => {
  return nodeTypes.map((nodeType, index) => ({
    nodeType,
    colors: getNodeTagColors(nodeType, index),
  }));
};
