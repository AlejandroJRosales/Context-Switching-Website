var isMobile;
var toggleModeMrgTxtLight;
var toggleModeMrgTxtDark;
var toggleModeDirIcon;
var toggleModeMrgIcon;

$(function() {
	loadDynamicHTML();
	isMobile = getIsMobile();
	applyDynamicStyle();
	buildTableOfContents();
});

function loadDynamicHTML() {
	$(".nav-placeholder").html(navbar);
	$(".title-section").html(titleSection);
	$(".footer-placeholder").html(footer);
}

function applyDynamicStyle() {
	$(".page-title").text($(".category-header").text());
	if (isMobile) {
		// $(".nav-bar-brand").css({ "font-size": "1em" });
		$(".code").css({ "font-size": "75%", "margin": "10% 3% 10% 3%" });
		$(".collapsible-contents-button").css({ "bottom": "7%", "right": "3%" });
		$(".contents-button").css({ "margin-left": "2%" });
		$("#collapse").css({ "margin-left": "2%" });
		$(".website-title").css({ "font-size": "1.5em" });
		$(".website-creator").css({ "font-size": ".8em" });
		$(".homepage-info").css({ "font-size": ".73em" });
		$(".page-title").css({ "padding": "9% 10% 5% 10%" });
		// $(".developed-by-text").css({ "margin-top": "0%" });
		$(".information").css({ "margin": "0% 10% 0% 10%" });
		$(".fa-moon").css({ "margin-left": "0px" });

		var windowHeight = $(window).height();
		var titleSectionHeight = $(".title-and-developer").height() + $(".page-properties").height();
		var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
		$(".title-section").css({ "margin-top": topBottomMargin - (topBottomMargin * .6), "margin-bottom": topBottomMargin + (topBottomMargin * .6) });
		$(window).scrollTop(0);
		toggleModeMrgTxtLight = "0px";
		toggleModeMrgTxtDark = "2px";
		toggleModeMrgIcon = "2px"
		toggleModeDirIcon = "margin-right";
	}
	else {
		var windowHeight = $(window).height();
		var titleSectionHeight = $($(".title-section")).height();
		var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
		$(".title-section").css({ "margin-top": topBottomMargin, "margin-bottom": topBottomMargin });
		$(window).scrollTop(0);
		toggleModeMrgTxtLight = "2px";
		toggleModeMrgTxtDark = "6px";
		toggleModeMrgIcon = "2px";
		toggleModeDirIcon = "margin-left";
	}
}

function buildTableOfContents() {
	var sectionHeaders = ["category-header", "section-header", "subsection-header", "subsubsection-header"]

	var tableOfContentsStr = "<h5><i class='far fa-list-alt' id='simple-nav-table'></i> Page Section Links</h5>";
	var lastHeaderIdx = 0;
	var currHeaderIdx = 0;

	// loop through the whole DOM tree using find(*)
	$(".information").find('*').each(function(index) {
		// get the section header name from the first paragraph tag
		var currentSectionName = $(this).find("p:first").attr('class');

		// make sure the node we are looking at is a header and is not categories definer
		if (typeof currentSectionName !== "undefined" && !$(this).hasClass('categories')) {
			currHeaderIdx = sectionHeaders.indexOf(currentSectionName);

			// header order: l: Graph theory, c: simple graph
			if (currHeaderIdx > lastHeaderIdx) {
				tableOfContentsStr += '<ul><li><a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				lastHeaderIdx = currHeaderIdx;
			}
			// header order: [last, current]
			else if (currHeaderIdx < lastHeaderIdx) {
				for (var closeListCount = 0; closeListCount < lastHeaderIdx - currHeaderIdx; closeListCount++) {
					tableOfContentsStr += "</ul>"
				}
				tableOfContentsStr += '<li><a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				lastHeaderIdx = currHeaderIdx;
			}
			else {
				if (currentSectionName === "category-header") {
					tableOfContentsStr += '<a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a><br>';
				}
				else {
					tableOfContentsStr += '<li><a href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				}
			}
		}
	});
	$(".table-of-contents").append(tableOfContentsStr);
}

window.MathJax = {
	tex: {
		inlineMath: [['$', '$'], ['\\(', '\\)']]
	}
};

function openSearch() {
	// document.getElementById("myOverlay").style.display = "block";
	// $("#find-button").css({ "background": "white" });
	// $("#find-button").text("");
	// $("#find-button").html("<input id='search-input'></input>");
	// $("#search-input").css({ "background": "white" });
	$(".nav-search-div").css({ "background-color": "white", "min-width": "140px" });
	// $(".nav-search-glyph").html("<p>X</p>");
	$(".nav-search-glyph").css({ "color": "black" });
	// $(".nav-search-input").html("<input placeholder='Search for a term'></input>");
	// $(".nav-search-input").css({ "border": "none" });
}


function toggleDarkMode() {
	if ($(".information").css("background-color") == "rgb(255, 255, 255)") {
		$("body").css({ "background": "black" });
		$(".page-title").css({ "color": "white" });
		$(".dot-txt").css({ "color": "white" });
		$(".information").css({ "background-color": "black", "color": "white" });
		$(".fa-moon").addClass("fa-sun").removeClass("fa-moon");
		$(".fa-sun").css({ toggleModeDirIcon: toggleModeMrgIcon, "color": "white" });
		$(".dark-mode-toggle-txt").text("Tap for Light Mode");
		$(".dark-mode-toggle-txt").css({ "color": "white", "margin-left": toggleModeMrgTxtDark });
		$("#dark-mode-toggle-btn").css({ "color": "white" });
	}
	else {
		$("body").css({ "background": "white" });
		$(".page-title").css({ "color": "black" });
		$(".dot-txt").css({ "color": "black" });
		$(".information").css({ "background-color": "white", "color": "black" });
		$(".fa-sun").addClass("fa-moon").removeClass("fa-sun");
		$(".fa-moon").css({ toggleModeDirIcon: toggleModeMrgIcon, "color": "black" });
		$(".dark-mode-toggle-txt").text("Tap for Dark Mode");
		$(".dark-mode-toggle-txt").css({ "color": "black", "margin-left": toggleModeMrgTxtLight });
		$("#dark-mode-toggle-btn").css({ "color": "black" });
	}
}

window.addEventListener('click', function(e) {
	// Clicked outside nav bar search box
	if (!document.getElementById('nav-search-box').contains(e.target)) {
		$(".nav-search-div").css({ "background-color": "transparent", "min-width": "180px" });
		$(".nav-search-glyph").css({ "color": "white" });
	}
});