$(document).ready(function () {
	var paddingPxTop = String($(window).height() * .18) + "px";
	var paddingPxBottom = String($(window).height() * .25) + "px";
	$(".website-intro").css({ "padding-top": paddingPxTop, "padding-bottom": paddingPxBottom });
});