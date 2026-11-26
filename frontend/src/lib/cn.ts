import { createCn } from "cn/config";

// WARNING: list every custom shadow and radius here, or overrides like shadow-none won't replace them
export const cn = createCn({
  extend: {
    theme: {
      shadow: ["border", "raised", "float", "modal", "field"],
      radius: ["chip", "control", "row", "menu", "card", "panel"],
    },
  },
});
