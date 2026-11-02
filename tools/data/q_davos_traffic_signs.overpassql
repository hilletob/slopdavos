[out:json][timeout:120];
(
  node["traffic_sign"](46.682,9.698,46.840,9.937);
  node["highway"~"^(stop|give_way|crossing)$"](46.682,9.698,46.840,9.937);
  way["highway"]["zone:maxspeed"](46.682,9.698,46.840,9.937);
  way["highway"]["maxspeed:type"](46.682,9.698,46.840,9.937);
  way["highway"]["traffic_sign"](46.682,9.698,46.840,9.937);
);
out geom;
