var isMobile = getIsMobile();
var toggleModeMrgTxtLight;
var toggleModeMrgTxtDark;
var toggleModeDirIcon;
var toggleModeMrgIcon;
var collapseContentsIsHidden = false;
var userHasScrolled = false;
var titleRevealed = false;
var delayInMilliseconds = 500; //1 second


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
	generateTableOfContents();
});

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

// function revealTitle() {
setTimeout(function() {
	// var elementBottom = $('.title-section')[0].getBoundingClientRect().bottom;
	// var reveals = $('.reveal-title')[0];
	// if (elementBottom < 0) {
	// 	reveals.classList.remove("active");
	// 	titleRevealed = false;
	// }
	// else if ($(window).scrollTop() >= 10 && userHasScrolled && !titleRevealed) {
	// titleRevealed = true;
	var reveals = $('.reveal-title')[0];
	$(".title-section").css({
		"-webkit-transition": "margin-top 1s ease-out",
		"-moz-transition": "margin-top 1s ease-out",
		"-o-transition": "margin-top 1s ease-out",
		"transition": "margin-top 1s ease-out"
	});

	var windowHeight = $(window).height();

	var titleSectionHeight = $($(".title-section")).height();
	var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
	$(".title-section").css({ "margin-top": topBottomMargin * .7, "margin-bottom": topBottomMargin });

	var contentsHeight = $(".table-of-contents").height();
	// var contentsTopBottomMargin = (windowHeight - contentsHeight);
	// console.log(contentsTopBottomMargin);
	$(".table-of-contents").css({ "margin-top": "50%", "margin-bottom": "50%" });
	reveals.classList.add("active");

}, delayInMilliseconds);

window.addEventListener("scroll", reveal);
window.addEventListener("scroll", revealButton);
// window.addEventListener("scroll", revealTitle);

$(function() {
	$(".sliding-link").click(function(e) {
		e.preventDefault();
		// console.log($(this).attr("href"));
		var aid = $(this).attr("href");
		$('html,body').animate({ scrollTop: $(aid).offset().top }, 'fast');
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
	console.log(isMobile);
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
	}

	var windowHeight = $(window).height();

	var titleSectionHeight = $(".title-section").height();
	var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
	topBottomMargin = topBottomMargin * 3;
	$(".title-section").css({ "margin-top": topBottomMargin, "margin-bottom": topBottomMargin });
	// $(window).scrollTop(0);
}

function generateTableOfContents() {
	var sectionHeaders = ["category-header", "section-header", "subsection-header", "subsubsection-header", "subsubsubsection-header"]

	var tableOfContentsStr = "";
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
					tableOfContentsStr += '<ul><li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				}
				else {
					tableOfContentsStr += '<li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				}
			}
		}
	});

	var collapsePageTopLink =
		`
		<div class="collapsible-contents-top">
			<li><a class="sliding-link" id="top-of-page-li contents-link" href="#nav-placeholder">Top of the Page</a></li>
			<button id="dark-mode-toggle-btn" onclick="toggleDarkMode()"><i class="fas fa-moon"></i>
		</div>
	 	<br>
	 `

	$(".table-of-contents").append('<div class="reveal fade-left"><h5>Contents</h5><hr>' + tableOfContentsStr + '</div>');
	$(".table-of-contents-collapsible").append('<h5>Contents</h5><br>' + collapsePageTopLink + tableOfContentsStr);
}

window.addEventListener('click', function(e) {
	// nav searh bar
	var isSearchBar = document.getElementById('nav-search-box').contains(e.target);
	// table of contents
	var isTOC = document.getElementById('collapse').contains(e.target);

	// Clicked outside table of contents
	if (!isSearchBar && !isTOC) {
		$(".collapse").collapse('hide');
	}

	// Clicked outside nav bar search box
	else if (isSearchBar) {
		$(".nav-search-div").css({ "background-color": "white" });
		$(".nav-search-glyph").css({ "color": "black" });
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