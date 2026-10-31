[out:json][timeout:120];
(
  node["traffic_sign"](46.71521,9.78805,46.83509,9.93464);
  node["highway"~"^(stop|give_way|crossing)$"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["zone:maxspeed"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["maxspeed:type"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["traffic_sign"](46.71521,9.78805,46.83509,9.93464);
);
out geom;
