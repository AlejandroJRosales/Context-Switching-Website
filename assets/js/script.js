var isMobile;
var toggleModeMrgTxtLight;
var toggleModeMrgTxtDark;
var toggleModeDirIcon;
var toggleModeMrgIcon;
var collapseContentsIsHidden = false;

$(function() {
	addDynamicHTML();
	isMobile = getIsMobile();
	applyDynamicStyle();
	generateTableOfContents();
});

$(function() {
	$(".sliding-link").click(function(e) {
		e.preventDefault();
		// console.log($(this).attr("href"));
		var aid = $(this).attr("href");
		$('html,body').animate({scrollTop: $(aid).offset().top},'fast');
	});
});

function addDynamicHTML() {
	$(".nav-placeholder").html(navbar);
	$(".title-section").html(titleSection);
	$(".footer-placeholder").html(footer);
	$(".table-of-contents-collapsible-div").html(tableOfContentsCollapsible);
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
		// $(".fa-moon").css({ "margin-left": "0px" });
		$(".collapsible-contents-top #dark-mode-toggle-btn").css({ "top": "4.75%", "right": "2%" });
		$(".figure").css({ "margin-top": "10%", "margin-bottom": "10%" });

		var windowHeight = $(window).height();
		var titleSectionHeight = $(".title-and-developer").height() + $(".page-properties").height();
		var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
		$(".title-section").css({ "margin-top": topBottomMargin - (topBottomMargin * .6), "margin-bottom": topBottomMargin + (topBottomMargin * .75) });
		// toggleModeMrgTxtLight = "0px";
		// toggleModeMrgTxtDark = "3px";
		// toggleModeMrgIcon = "2px"
		// toggleModeDirIcon = "margin-right";
	}
	else {
		var windowHeight = $(window).height();
		var titleSectionHeight = $($(".title-section")).height();
		var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
		$(".title-section").css({ "margin-top": topBottomMargin, "margin-bottom": topBottomMargin });
		$(window).scrollTop(0);
		// toggleModeMrgTxtLight = "2px";
		// toggleModeMrgTxtDark = "6px";
		// toggleModeMrgIcon = "2px";
		// toggleModeDirIcon = "margin-left";
	}
}

function generateTableOfContents() {
	var sectionHeaders = ["category-header", "section-header", "subsection-header", "subsubsection-header"]

	var tableOfContentsStr = "Section Links</h5>";
	var lastHeaderIdx = 0;
	var currHeaderIdx = 0;

	// loop through the whole DOM tree using find(*)
	$(".information").find('*').each(function(index) {
		// get the section header name from the first paragraph tag
		var currentSectionName = $(this).find("p:first").attr('class');

		// make sure the node we are looking at is a header and is not categories definer
		if (typeof currentSectionName !== "undefined" && !$(this).hasClass('categories')) {
			currHeaderIdx = sectionHeaders.indexOf(currentSectionName);
			if (currHeaderIdx > lastHeaderIdx) {
				tableOfContentsStr += '<ul><li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				lastHeaderIdx = currHeaderIdx;
			}
			// header order: [last, current]
			else if (currHeaderIdx < lastHeaderIdx) {
				for (var closeListCount = 0; closeListCount < lastHeaderIdx - currHeaderIdx; closeListCount++) {
					tableOfContentsStr += "</ul>"
				}
				tableOfContentsStr += '<li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				lastHeaderIdx = currHeaderIdx;
			}
			else {
				if (currentSectionName === "category-header") {
					tableOfContentsStr += '<a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a><br>';
				}
				else {
					tableOfContentsStr += '<li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				}
			}
		}
	});

	$(".table-of-contents").append("<h5><i class='far fa-list-alt' id='simple-nav-table'></i> " + tableOfContentsStr);
	$(".table-of-contents-collapsible").append('<h5>' + tableOfContentsStr);
}

window.MathJax = {
	tex: {
		inlineMath: [['$', '$'], ['\\(', '\\)']]
	}
};

window.addEventListener('click', function(e) {
	// Clicked outside nav bar search box
	if (!document.getElementById('collapse').contains(e.target)) {
		$(".collapse").collapse('hide');
	}
	// Clicked outside nav bar search box
	if (!document.getElementById('contents-link').contains(e.target)) {
		$(".collapse").collapse('hide');
	}
	// Clicked outside nav bar search box
	if (!document.getElementById('nav-search-box').contains(e.target)) {
		$(".nav-search-div").css({ "background-color": "transparent", "min-width": "180px" });
		$(".nav-search-glyph").css({ "color": "white" });
	}
});

function showIt(elementId) {
    var el = document.getElementById(elementId);
    el.scrollIntoView(true);
}

function toggleDarkMode() {
	if ($(".information").css("background-color") == "rgb(255, 255, 255)") {
		$("body").css({ "background": "black" });
		$(".page-title").css({ "color": "white" });
		$(".dot-txt").css({ "color": "white" });
		$(".information").css({ "background-color": "black", "color": "white" });
		$(".fa-moon").addClass("fa-sun").removeClass("fa-moon");
		$(".fa-sun").css({ "color": "white" });
		$(".dark-mode-toggle-txt").text("Click for Light Mode");
		$(".dark-mode-toggle-txt").css({ "color": "white", "margin-left": "2%" });
		$("#dark-mode-toggle-btn").css({ "color": "white" });
	}
	else {
		$("body").css({ "background": "white" });
		$(".page-title").css({ "color": "black" });
		$(".dot-txt").css({ "color": "black" });
		$(".information").css({ "background-color": "white", "color": "black" });
		$(".fa-sun").addClass("fa-moon").removeClass("fa-sun");
		$(".fa-moon").css({ "color": "black" });
		$(".dark-mode-toggle-txt").text("Click for Dark Mode");
		$(".dark-mode-toggle-txt").css({ "color": "black", "margin-left": "1%" });
		$("#dark-mode-toggle-btn").css({ "color": "black" });
	}
}