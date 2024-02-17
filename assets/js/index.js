$(document).ready(function () {
	var paddingPxTop = String($(window).height() * .235) + "px";
	var paddingPxBottom = String($(window).height() * .325) + "px";
	$(".website-intro").css({ "padding-top": paddingPxTop, "padding-bottom": paddingPxBottom });
});