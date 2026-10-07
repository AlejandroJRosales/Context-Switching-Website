windowHeight = $(window).height();
if (isMobile) {
	h = windowHeight * .275;
	w = windowHeight * .275;
}
else {
	h = windowHeight * .4;
	w = windowHeight * .4;
}

$(".pet-avatar").css({ "height": h, "width": w });