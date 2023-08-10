var isMobile = getIsMobile();
var toggleModeMrgTxtLight;
var toggleModeMrgTxtDark;
var toggleModeDirIcon;
var toggleModeMrgIcon;
var collapseContentsIsHidden = false;
var userHasScrolled = false;
var titleRevealed = false;
var delayInMilliseconds = 500; //1 second
var sectionHeaders = ["category-header", "section-header", "subsection-header", "subsubsection-header", "subsubsubsection-header"];


window.MathJax = {
	loader: {
		load: ['[tex]/braket']
	},
	tex: {
		inlineMath: [['$', '$'], ['\\(', '\\)']],
		packages: { '[+]': ['braket'] }
	},
	svg: {
		fontCache: 'global'
	}
};

$(function() {
	addDynamicHTML();
	applyDynamicStyle();
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
		$(".code").css({ "font-size": "75%", "margin": "10% 3% 10% 3%" });
		$(".website-title").css({ "font-size": "1.5em" });
		$(".website-creator").css({ "font-size": ".8em" });
		$(".homepage-info").css({ "font-size": ".73em" });
		$(".page-title").css({ "padding": "0% 10% 5% 10%" });
		$(".information").css({ "margin": "0% 10% 10% 10%" });
		$(".figure").css({ "margin-top": "10%", "margin-bottom": "10%", "width": "90%" });
		$(".nav-search-div").css({ "min-width": "225px" });
		$("#nav-search-box").css({ "min-width": "200px" });
		$(".img-avatar").css({ "height": "48%", "width": "48%" });
		$(".avatar-page-developer").css({ "font-size": "1.3em", "padding-top": "7%" });
	}

	var windowHeight = $(window).height();

	var titleSectionHeight = $(".title-section").height();
	var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
	topBottomMargin = topBottomMargin * 3;
	$(".title-section").css({ "margin-top": topBottomMargin, "margin-bottom": topBottomMargin });

	var titleSectionHeight = $(".avatar-title-section").height();
	var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
	topBottomMargin = topBottomMargin * 3;
	$(".avatar-title-section").css({ "margin-top": topBottomMargin, "margin-bottom": "0px" });
	// $(window).scrollTop(0);
}

function getSectionNumber(headerCount, currHeaderIdx) {
	// return "";
	sectionNumbering = "";
	for (idx = 1; idx <= currHeaderIdx; idx++) {
		sectionName = sectionHeaders[idx];
		if (idx != currHeaderIdx) {
			sectionNumbering += String(headerCount[sectionName]) + ".";
		}
		else {
			sectionNumbering += String(headerCount[sectionName]) + " ";
		}
	}
	return sectionNumbering;
}

$(function() {
	$(".sliding-link").click(function(e) {
		e.preventDefault();
		// console.log($(this).attr("href"));
		var aid = $(this).attr("href");
		$('html,body').animate({ scrollTop: $(aid).offset().top }, 'fast');
	});
});

window.addEventListener("scroll", reveal);
window.addEventListener("scroll", revealButton);
// window.addEventListener("scroll", revealTitle);

window.addEventListener('click', function(e) {
	// nav searh bar
	var isSearchBar = document.getElementById('nav-search-box').contains(e.target);

	if (isSearchBar) {
		$(".nav-search-div").css({ "background-color": "white" });
		$(".nav-search-glyph").css({ "color": "black" });
	}
});

function reveal() {
	userHasScrolled = true;
	var reveals = document.querySelectorAll(".reveal");

	for (var i = 0; i < reveals.length; i++) {
		var windowHeight = window.innerHeight;
		var elementTop = reveals[i].getBoundingClientRect().top;
		var elementVisible = 10;

		if (elementTop < windowHeight - elementVisible) {
			reveals[i].classList.add("active");
		} else {
			reveals[i].classList.remove("active");
		}
	}
}

function revealButton() {
	var reveals = $('.reveal-button')[0];

	var windowHeight = window.innerHeight;
	var elementTop = $('.table-of-contents')[0].getBoundingClientRect().top;
	var elementVisible = 10;
	// console.log($('.category-header')[0].getBoundingClientRect().top, windowHeight, elementVisible, windowHeight - elementVisible, elementTop < windowHeight - elementVisible);

	if (elementTop < windowHeight - elementVisible) {
		reveals.classList.add("active");
	} else {
		reveals.classList.remove("active");
	}
}

function showIt(elementId) {
	var el = document.getElementById(elementId);
	el.scrollIntoView(true);
}

function toggleDarkMode() {
	if ($("body").css("background").indexOf("rgb(255, 255, 255)") == 0) {
		$("body").css({ "background-color": "rgb(41,41,41)" });
		$(".website-intro").css({ "background-color": "rgb(41,41,41)" });
		$(".page-title").css({ "color": "white" });
		$(".dot-txt").css({ "color": "white" });
		$(".information").css({ "background-color": "rgb(41,41,41)", "color": "white" });
		$(".fa-moon").addClass("fa-sun").removeClass("fa-moon");
		$(".fa-sun").css({ "color": "white" });
		$(".dark-mode-toggle-txt").text("Click for Light Mode");
		$(".dark-mode-toggle-txt").css({ "color": "white", "margin-left": "2%" });
		$("#dark-mode-toggle-btn").css({ "color": "white" });
		$(".figure").css({ "-webkit-filter": "invert(1)", "filter": "invert(1)" });
		$(".mini-banner").css({ "background": "rgb(41,41,41)", "color": "white" });
		$(".mini-banner-label").css({ "color": "white" });
		$(".website-title").css({ "color": "white" });
	}
	else {
		$("body").css({ "background-color": "rgb(255, 255, 255)" });
		$(".website-intro").css({ "background-color": "rgb(255, 255, 255)" });
		$(".page-title").css({ "color": "black" });
		$(".dot-txt").css({ "color": "black" });
		$(".information").css({ "background-color": "white", "color": "black" });
		$(".fa-sun").addClass("fa-moon").removeClass("fa-sun");
		$(".fa-moon").css({ "color": "black" });
		$(".dark-mode-toggle-txt").text("Click for Dark Mode");
		$(".dark-mode-toggle-txt").css({ "color": "black", "margin-left": "1%" });
		$("#dark-mode-toggle-btn").css({ "color": "black" });
		$(".figure").css({ "-webkit-filter": "invert(0)", "filter": "invert(0)" });
		$(".mini-banner").css({ "background": "white", "color": "black" });
		$(".mini-banner-label").css({ "color": "black" });
		$(".website-title").css({ "color": "black" });
	}
}

function focusMode() {
	$(".nav-placeholder").remove();
	$(".title-section").remove();
	$(".table-of-contents").remove();
	$(".table-of-contents-collapsible-div").remove();
	$(".footer-placeholder").remove();

	var exitFocusModeBtn = '<button class="focus-mode-btn" onclick="exitFocusMode()""><p>[Exit Focus Mode]</p></button>'
	var darkModeTggleBtn = '<button class="focus-mode-btn" onclick="toggleDarkMode()""><p>[Toggle Dark Mode]</p></button>'
	$(".information").prepend(exitFocusModeBtn + darkModeTggleBtn);
	// $(window).scrollTop(0);
}

function exitFocusMode() {
	location.reload();
}