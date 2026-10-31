[out:json][timeout:180];
(
  way["amenity"="parking"](46.71521,9.78805,46.83509,9.93464);
  relation["amenity"="parking"](46.71521,9.78805,46.83509,9.93464);
  nwr["amenity"="parking_space"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["parking:both"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["parking:left"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["parking:right"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["parking:lane:both"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["parking:lane:left"](46.71521,9.78805,46.83509,9.93464);
  way["highway"]["parking:lane:right"](46.71521,9.78805,46.83509,9.93464);
);
out geom;
