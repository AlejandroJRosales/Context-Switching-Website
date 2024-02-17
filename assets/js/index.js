$(document).ready(function () {
	var paddingPxTop = String($(window).height() * .275) + "px";
	var paddingPxBottom = String($(window).height() * .40) + "px";
	$(".website-intro").css({ "padding-top": paddingPxTop, "padding-bottom": paddingPxBottom });
});