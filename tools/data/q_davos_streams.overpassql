[out:json][timeout:180];
(
  way["waterway"~"^(river|stream|canal|ditch|drain|brook)$"](46.71521,9.78805,46.83509,9.93464);
);
out geom;
