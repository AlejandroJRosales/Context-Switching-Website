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
if (!localStorage.getItem('isDarkMode')) {
	localStorage.setItem('isDarkMode', false);
}

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

$(function () {
	applyDynamicStyle();
	addDynamicHTML();
	applyModeStyle();
	reveal();
	generateTableOfContents();
});

function addDynamicHTML() {
	$(".nav-placeholder").html(navbar);
	$(".footer-placeholder").html(footer);
	$(".table-of-contents-collapsible-div").html(tableOfContentsCollapsible);
	$(".oneai-div").html(oneaiDiv);
	$(".explore-placeholder").html(exploreSection);
}

function applyDynamicStyle() {
	$(".title-section").html(titleSection);
	$(".homepage-buttons").css({ "text-align": "right", "margin-right": "1em" });

	$(".page-title").text($(".category-header").text());
	if (isMobile) {
		$(".fa-moon").css({ "margin-top": ".5em" });
		$(".fa-sun").css({ "margin-top": ".5em" });
		$(".code").css({ "font-size": "75%", "margin": "10% 3% 10% 3%" });
		$(".homepage-info").css({ "font-size": ".73em" });
		$(".page-title").css({ "padding": "0% 10% 5% 10%" });
		$(".information").css({ "margin": "0% 8% 20% 8%" });
		$(".figure").css({ "margin-top": "10%", "margin-bottom": "10%", "width": "80%" });
		$(".figure-ignore").css({ "margin-top": "10%", "margin-bottom": "10%", "width": "70%" });
		$(".nav-search-div").css({ "min-width": "225px" });
		$("#nav-search-box").css({ "min-width": "200px" });
		$(".img-avatar").css({ "height": "48%", "width": "48%" });
		$(".avatar-page-developer").css({ "font-size": "1.3em", "padding-top": "7%" });
		$(".title-section").css({ "padding-left": "5%", "padding-right": "5%"});
		$(".related-article-card").css({ "min-width": "100%" });
		// $(".oneai-collapse").css({ "max-width": "80%" });
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

function generateTableOfContents() {

	let headerCount = {};

	for (idx = 0; idx <= sectionHeaders.length; idx++) {
		sectionName = sectionHeaders[idx];
		headerCount[sectionName] = 0;
	}

	var tableOfContentsStr = "";
	var lastHeaderIdx = 0;
	var currHeaderIdx = 0;
	var ulCount = 0;

	// loop through the whole DOM tree using find(*)
	$(".information").find('*').each(function (index) {
		// get the section header name from the first paragraph tag
		var currentSectionName = $(this).find("p:first").attr('class');

		// make sure not categories header
		if (typeof currentSectionName !== "undefined" && !$(this).hasClass('categories') && !$(this).hasClass('toc-ignore')) {
			currHeaderIdx = sectionHeaders.indexOf(currentSectionName);

			headerCount[currentSectionName] = headerCount[currentSectionName] + 1;
			currentSectionNum = "";

			// tabs over
			if (currHeaderIdx > lastHeaderIdx) {

				tableOfContentsStr += '<ul><li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';
				ulCount += 1;
				sectionNumbering = getSectionNumber(headerCount, currHeaderIdx);
				$("#" + $(this).find("p:first").attr('id')).prepend(sectionNumbering);

				lastHeaderIdx = currHeaderIdx;

			}

			// untab
			else if (currHeaderIdx < lastHeaderIdx) {

				tempHeaderCount = lastHeaderIdx;
				for (var closeListCount = 0; closeListCount < lastHeaderIdx - currHeaderIdx; closeListCount++) {
					console.log(headerCount[sectionHeaders[tempHeaderCount]]);
					headerCount[sectionHeaders[tempHeaderCount]] = 0;
					console.log(headerCount[sectionHeaders[tempHeaderCount]]);
					tempHeaderCount -= 1;
					ulCount -= 1;
					tableOfContentsStr += '</ul>'
				}

				tableOfContentsStr += '<li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';

				sectionNumbering = getSectionNumber(headerCount, currHeaderIdx);
				$("#" + $(this).find("p:first").attr('id')).prepend(sectionNumbering);

				lastHeaderIdx = currHeaderIdx;
			}

			// same tabs
			else {
				if (currentSectionName === "category-header") {
					tableOfContentsStr += '<a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a>';
				}

				else {
					tableOfContentsStr += '<li><a class="sliding-link" id="contents-link" href="#' + $(this).find("p:first").attr('id') + '">' + $(this).find("p:first").text() + '</a></li>';

					sectionNumbering = getSectionNumber(headerCount, currHeaderIdx);
					$("#" + $(this).find("p:first").attr('id')).prepend(sectionNumbering);
				}
			}
		}
	});

	// Bandaid fix, please improve this logic error fix later
	for (var closeListCount = 0; closeListCount < ulCount - 1; closeListCount++) {
		console.log("ulCount, " + ulCount);
		tableOfContentsStr += '</ul>'
	}
	tableOfContentsStr +=  '<li><a class="sliding-link" id="contents-link" href="#related-articles">Related Articles</a></li>';
	//

	// var topLinks = '<br><button id="dark-mode-toggle-btn-ignore" onclick="toggleDarkMode()"><i class="fas fa-moon fa-moon-ignore fa-2xl dark-mode-toggle-btn-ignore"></i></button><br><br></div><a id="top-of-page-li contents-link" href="/">Home</a><br><br>'
	$(".table-of-contents").append('<div class="reveal fade-left"><h5>Contents</h5><hr class="section-seperator"><br>' + tableOfContentsStr + '</div>');
	$(".table-of-contents-collapsible").append('<h5>Contents</h5><br>' + tableOfContentsStr);
}

$(function () {
	$(".sliding-link").click(function (e) {
		e.preventDefault();
		// console.log($(this).attr("href"));
		var aid = $(this).attr("href");
		$('html,body').animate({ scrollTop: $(aid).offset().top }, 'fast');
	});
});

window.addEventListener("scroll", reveal);
window.addEventListener("scroll", revealButton);
// window.addEventListener("scroll", revealTitle);

window.addEventListener('click', function (e) {
	// nav searh bar
	// var isSearchBar = document.getElementById('nav-search-box').contains(e.target);
	// table of contents
	// var isContainer = document.getElementById('collapse-container').contains(e.target);
	var infoClick = $('.information')[0].contains(e.target);

	// Clicked outside table of contents
	if (infoClick) {
		$(".collapse").collapse('hide');
	}

	// Clicked outside nav bar search box
	// else if (isSearchBar) {
	// 	$(".nav-search-div").css({ "background-color": "white" });
	// 	$(".nav-search-glyph").css({ "color": "black" });
	// }
});

window.addEventListener('scroll', function (e) {
	var windowHeight = window.innerHeight;
	var elementTop = $('.table-of-contents')[0].getBoundingClientRect().top;
	var elementVisible = 10;
	// console.log($('.category-header')[0].getBoundingClientRect().top, windowHeight, elementVisible, windowHeight - elementVisible, elementTop < windowHeight - elementVisible);

	if (elementTop < windowHeight - elementVisible) {
		$(".collapse").collapse('hide');
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
	var revealTOC = $('.reveal-button')[0];

	var windowHeight = window.innerHeight;
	var elementTop = $('.table-of-contents')[0].getBoundingClientRect().top;
	var elementVisible = 0;
	// console.log($('.category-header')[0].getBoundingClientRect().top, windowHeight, elementVisible, windowHeight - elementVisible, elementTop < windowHeight - elementVisible);

	if (elementTop < windowHeight - elementVisible) {
		revealTOC.classList.remove("inactive");
		revealTOC.classList.add("active");
		// $('.reveal-oneai-button')[0].classList.add("active");
	} else {
		revealTOC.classList.remove("active");
		revealTOC.classList.add("inactive");
		// $('.reveal-oneai-button')[0].classList.remove("active");
	}
}

// function revealTitle() {
setTimeout(function () {
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

	$(".avatar-title-section").css({
		"-webkit-transition": "margin-top 1s ease-out",
		"-moz-transition": "margin-top 1s ease-out",
		"-o-transition": "margin-top 1s ease-out",
		"transition": "margin-top 1s ease-out"
	});

	var windowHeight = $(window).height();

	var titleSectionHeight = $($(".title-section")).height();
	var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
	$(".title-section").css({ "margin-top": topBottomMargin * .7, "margin-bottom": topBottomMargin });

	var titleSectionHeight = $($(".avatar-title-section")).height();
	var topBottomMargin = (windowHeight - titleSectionHeight) / 2;
	$(".avatar-title-section").css({ "margin-top": topBottomMargin * .70, "margin-bottom": topBottomMargin });

	var contentsHeight = $(".table-of-contents").height();
	// var contentsTopBottomMargin = (windowHeight - contentsHeight);
	// console.log(contentsTopBottomMargin);
	$(".table-of-contents").css({ "margin-top": "25%", "margin-bottom": "25%" });
	reveals.classList.add("active");

}, delayInMilliseconds);

function showIt(elementId) {
	var el = document.getElementById(elementId);
	el.scrollIntoView(true);
}

function partyMode() {
	$("body")[0].classList.add("fa-solid");
	$("body")[0].classList.add("fa-thumbtack");
	$("body")[0].classList.add("fa-beat-fade");
}

function applyModeStyle() {
	if (localStorage.getItem('isDarkMode') === 'true') {
		$("body").css({ "background": "rgb(41,41,41)" });
		$(".website-intro").css({ "background": "rgb(41,41,41)" });
		$(".page-title").css({ "color": "white" });
		$(".dot-txt").css({ "color": "white" });
		$(".information").css({ "color": "white" });
		$(".fa-moon").addClass("fa-sun").removeClass("fa-moon");
		$(".fa-sun").css({ "color": "white" });
		$("#dark-mode-toggle-btn").css({ "color": "white" });
		$(".figure").css({ "-webkit-filter": "invert(1)", "filter": "invert(1)" });
		$(".mini-banner-label").css({ "color": "white" });
		$(".website-title").css({ "color": "white" });
		$(".info-table").css({ "color": "white" });
		$("#about-me-status").css({ "color": "white" });
		$(".explore-text-box").css({ "color": "white" });
		$(".explore-icon").css({ "color": "#ffffff" });
		$("#aboutme-github-icon").css({ "color": "white" });
		$(".card-title").css({ "color": "white" });
		$(".card-text").css({ "color": "white" });
		$(".card-body").css({ "background": "rgb(41,41,41)" });
		$(".card-footer").css({ "background": "rgb(41,41,41)" });
		// clean up
		$("#related-articles").css({ "color": "white" });
		
		// $("hr.section-line-seperator").css({ "border-top": "1px solid white important" });
	}
	else {
		$("body").css({ "background": "white" });
		$(".website-intro").css({ "background": "white" });
		$(".page-title").css({ "color": "black" });
		$(".dot-txt").css({ "color": "black" });
		$(".information").css({ "color": "black" });
		$(".fa-sun").addClass("fa-moon").removeClass("fa-sun");
		$(".fa-moon").css({ "color": "black" });
		$(".fa-moon-ignore").css({ "color": "white" });
		$("#dark-mode-toggle-btn").css({ "color": "black" });
		$(".figure").css({ "-webkit-filter": "invert(0)", "filter": "invert(0)" });
		$(".mini-banner-label").css({ "color": "black" });
		$(".website-title").css({ "color": "black" });
		$(".info-table").css({ "color": "black" });
		$("#about-me-status").css({ "color": "black" });
		$(".explore-text-box").css({ "color": "black" });
		$(".explore-icon").css({ "color": "#000000" });
		$("#aboutme-github-icon").css({ "color": "rgb(30,49,80)" });
		$(".card-title").css({ "color": "black" });
		$(".card-text").css({ "color": "black" });
		$(".card-body").css({ "background": "white" });
		$(".card-footer").css({ "background": "white" });
		// $("hr.section-line-seperator").css({ "border-top": "1px solid rgba(0,0,0,.1) !important" });
		// clean up
		$("#related-articles").css({ "color": "black" });
	}
}

function topOfPage() {
	var revealTOC = $('.reveal-button')[0];
	revealTOC.classList.remove("active");
	revealTOC.classList.add("inactive");
	$('html,body').animate({ scrollTop: $("#top-of-page").offset().top }, 'fast');
}

function toggleDarkMode() {
	if (localStorage.getItem('isDarkMode') === 'true') {
		localStorage.setItem('isDarkMode', false);
	}
	else {
		localStorage.setItem('isDarkMode', true);
	}
	applyModeStyle();
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