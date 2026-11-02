[out:json][timeout:180];
(
  way["waterway"~"^(river|stream|canal|ditch|drain|brook)$"](46.682,9.698,46.840,9.937);
);
out geom;
