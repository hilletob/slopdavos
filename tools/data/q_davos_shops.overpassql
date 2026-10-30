[out:json][timeout:180];
(
  nwr["shop"]["name"](46.71521,9.78805,46.83509,9.93464);
  nwr["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|bank|pharmacy|post_office|cinema|fuel)$"]["name"](46.71521,9.78805,46.83509,9.93464);
  nwr["tourism"~"^(hotel|hostel|guest_house|museum)$"]["name"](46.71521,9.78805,46.83509,9.93464);
);
out center tags;
