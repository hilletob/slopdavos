// Small DOM helpers shared by the HUD, the dialogs and the missions.

/** A new element: `className` and `text` (as textContent) when given */
export const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};
