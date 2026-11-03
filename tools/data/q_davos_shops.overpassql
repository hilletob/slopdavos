[out:json][timeout:180];
(
  nwr["shop"]["name"](46.682,9.698,46.840,9.985);
  nwr["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|bank|pharmacy|post_office|cinema|fuel)$"]["name"](46.682,9.698,46.840,9.985);
  nwr["tourism"~"^(hotel|hostel|guest_house|museum)$"]["name"](46.682,9.698,46.840,9.985);
);
out center tags;
