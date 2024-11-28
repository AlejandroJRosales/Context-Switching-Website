$(document).ready(function () {
	var paddingPxTop = String($(window).height() * .19) + "px";
	var paddingPxBottom = String($(window).height() * .0) + "px";
	$(".website-intro").css({ "padding-top": paddingPxTop, "padding-bottom": paddingPxBottom });
});