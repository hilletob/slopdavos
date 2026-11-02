[out:json][timeout:180];
(
  way["amenity"="parking"](46.682,9.698,46.840,9.937);
  relation["amenity"="parking"](46.682,9.698,46.840,9.937);
  nwr["amenity"="parking_space"](46.682,9.698,46.840,9.937);
  way["highway"]["parking:both"](46.682,9.698,46.840,9.937);
  way["highway"]["parking:left"](46.682,9.698,46.840,9.937);
  way["highway"]["parking:right"](46.682,9.698,46.840,9.937);
  way["highway"]["parking:lane:both"](46.682,9.698,46.840,9.937);
  way["highway"]["parking:lane:left"](46.682,9.698,46.840,9.937);
  way["highway"]["parking:lane:right"](46.682,9.698,46.840,9.937);
);
out geom;
