var isMobile = getIsMobile();
var toggleModeMrgTxtLight;
var toggleModeMrgTxtDark;
var toggleModeDirIcon;
var toggleModeMrgIcon;
var collapseContentsIsHidden = false;
var userHasScrolled = false;
var titleRevealed = false;
var delayInMilliseconds = 500; //1 second
var currViewStatic = true;
// must be in order they appear in the DOM
// var slidingIconsNames = [".sliding-pinned", ".sliding-new", ".sliding-explore"];
var slidingIcons = document.querySelectorAll(".sliding-icon");
var sectionIconsLen = slidingIcons.length;
var sectionIcons = document.querySelectorAll(".section-icon");
var reveals = document.querySelectorAll(".reveal");
var revealsLen = reveals.length;
var windowHeight = window.innerHeight;
var displayHeight = $(window).height();
var elVisibleOffset = -14;

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

if (!localStorage.getItem('isDarkMode')) {
	localStorage.setItem('isDarkMode', false);
}

function partyMode() {
	$("body")[0].classList.add("fa-solid");
	$("body")[0].classList.add("fa-thumbtack");
	$("body")[0].classList.add("fa-beat-fade");
}

$(function () {
	addDynamicHTML();
	applyDynamicStyle();
	handleScroll();
});

function addDynamicHTML() {
	$(".oneai-div").html(oneaiDiv);
	setTimeout(() => {
		reveals[0].classList.add("active")
		$('.reveal-oneai-button')[0].classList.add("active");
	}, 700);
	$(".nav-placeholder").html(navbar);
	$(".footer-placeholder").html(footer);
	$(".explore-placeholder").html(exploreSection);
	// $(".topic-page-title-section").html(topicPageTitleSection);
}

function applyDynamicStyle() {
	applyModeStyle();
	displayHeight = $(window).height();
	$(".page-title").text($(".category-header").text());
	if (isMobile) {
		// elVisibleOffset = displayHeight * .1;
		// $(".fa-moon").css({ "margin-top": ".5em" });
		// $(".fa-sun").css({ "margin-top": ".5em" });
		console.log("is mobile");
		$(".website-title").css({ "font-size": "1.5em", "margin-bottom": ".75em" });
		$(".topic-title").css({ "font-size": "1.5em", "margin-bottom": ".75em" });
		$(".website-creator-by").css({ "font-size": "1.1em" });
		$(".website-creator").css({ "font-size": ".92em" });
		$(".mini-banner-label").css({ "padding-left": "10%", "padding-right": "10%", "margin-top:": "2em", "margin-bottom": "1em" });
		$(".homepage-info").css({ "font-size": ".73em" });
		$(".dedication-container").css({ "font-size": "1em" });
		$(".article-sections-container").css({ "margin": "90% 0% 10% 0%" });
		$("#website-creator-name").css({ "padding-top": "4px", "font-size": ".73em" });
		$(".page-title").css({ "padding": "0% 10% 5% 10%" });
		$(".information").css({ "margin": "0% 10% 10% 10%" });
		$(".figure").css({ "margin-top": "10%", "margin-bottom": "10%", "width": "90%" });
		$(".nav-search-div").css({ "min-width": "225px" });
		$("#nav-search-box").css({ "min-width": "200px" });
		$(".img-avatar").css({ "height": "48%", "width": "48%" });
		$(".avatar-page-developer").css({ "font-size": "1.3em", "padding-top": "7%" });
		$(".reveal-website-opener").css({ "padding-bottom": "25%" });
		$(".featured-section").css({ "margin": "3em 0em 1em 0em" });
		$(".home-text-box").css({ "padding": "3% 10% 2% 10%" });
		$(".footer-placeholder").css({ "margin-top": "20%" });
		$(".figure-ignore").css({ "width": "90%", "margin-bottom": "5%" });
		$(".figure").css({ "width": "90%", "margin-bottom": "5%" });
		$(".homepage-sliding-section").css({ "padding-top": "4%" });
		$(".mini-banner-label").css({ "margin": "0% 10% 0% 10%" });
		$(".subtopic-mini-banner-label").css({ "margin": "0% 10% 0% 10%" });
	}
}

$(function () {
	$(".sliding-link").click(function (e) {
		e.preventDefault();
		var aid = $(this).attr("href");
		$('html,body').animate({ scrollTop: $(aid).offset().top }, 'fast');
	});
});

$(function () {
	$(".sliding-link-offset").click(function (e) {
		e.preventDefault();
		var aid = $(this).attr("href");
		$('html,body').animate({ scrollTop: $(aid).offset().top - (displayHeight * .12) }, 'fast');
	});
});

window.addEventListener("scroll", handleScroll);

// window.addEventListener('click', function(e) {
// 	// nav searh bar
// 	var isSearchBar = document.getElementById('nav-search-box').contains(e.target);

// 	if (isSearchBar) {
// 		$(".nav-search-div").css({ "background-color": "white" });
// 		$(".nav-search-glyph").css({ "color": "black" });
// 	}
// });

function handleScroll() {
	displayHeight = $(window).height();

	elementTop = $(".homepage-static-buttons")[0].getBoundingClientRect().top;
	elementVisible = displayHeight + elVisibleOffset;
	if (elementTop + elementVisible < windowHeight && currViewStatic) {
		$(".home-nav-bttn").css({ 'display': 'block', 'visibility': 'hidden' });
		$(".homepage-sliding-section").css({ 'display': 'block', 'visibility': 'visible' });
		currViewStatic = false;
	}
	if (elementTop + elementVisible > windowHeight && !currViewStatic) {
		$(".home-nav-bttn").css({ 'display': 'block', 'visibility': 'visible' });
		$(".homepage-sliding-section").css({ 'display': 'none', 'visibility': 'hidden' });
		currViewStatic = true;
	}
	slidingIconSizeUpdate();
	reveal();
}

function slidingIconSizeUpdate() {
	elementVisible = 250;
	elementNotVisible = 250;
	// todo: init sectionIconsLength, only check for change in view
	for (var i = 0; i < sectionIconsLen; i++) {
		elementTop = sectionIcons[i].getBoundingClientRect().top;
		currIcon = sectionIcons[i];
		if (elementTop < windowHeight - elementVisible) {
			slidingIcons[i].classList.add("underline");
			for (var j = 0; j < sectionIconsLen; j++) {
				if (i != j) {
					slidingIcons[j].classList.remove("underline");
				}
			}
		}
	}
}

function reveal() {
	userHasScrolled = true;
	var elementVisible = 250;
	var elementNotVisible = 250;
	for (var i = 0; i < revealsLen; i++) {
		elementTop = reveals[i].getBoundingClientRect().top;

		if (elementTop < windowHeight - elementVisible) {
			reveals[i].classList.remove("inactive");
			reveals[i].classList.add("active");
		}
		if (elementTop > windowHeight - elementNotVisible) {
			reveals[i].classList.remove("active");
			reveals[i].classList.add("inactive");
		}
	}
}

function showIt(elementId) {
	var el = document.getElementById(elementId);
	el.scrollIntoView(true);
}

function applyModeStyle() {
	if (localStorage.getItem('isDarkMode') === 'true') {
		$("body").css({ "background-color": "rgb(41,41,41)" });
		$(".website-intro").css({ "background-color": "rgb(41,41,41)" });
		$(".website-creator-by").css({ "color": "white" });
		$(".fa-moon").addClass("fa-sun").removeClass("fa-moon");
		$(".fa-sun").css({ "color": "white" });
		$("#dark-mode-toggle-btn").css({ "color": "white" });
		$(".figure").css({ "-webkit-filter": "invert(1)", "filter": "invert(1)" });
		$(".featured-section").css({ "color": "white" });
		$(".mini-banner").css({ "color": "white" });
		$(".mini-banner-label").css({ "color": "white" });
		$(".subtopic-mini-banner-label").css({ "color": "white" });
		$(".website-title").css({ "color": "white" }); $(".topic-title").css({ "color": "black" });
		$(".topic-title").css({ "color": "white" });
		$(".home-text-box").css({ "color": "white" });
		// $(".homepage-info").css({ "background-color": "rgb(41,41,41)", "color": "white" });
		$(".homepage-icon").css({ "color": "#ffffff" });
		$(".homepage-static-section-buttons-label").css({ "color": "white" });
		$(".sliding-icon-label").css({ "color": "white" });
		$(".sliding-icon-update-label").css({ "color": "white" });
		$(".dedication-container").css({ "color": "white" });
	}
	else {
		$("body").css({ "background-color": "rgb(255, 255, 255)" });
		$(".website-intro").css({ "background-color": "rgb(255, 255, 255)" });
		$(".website-creator-by").css({ "color": "black" });
		$(".fa-sun").addClass("fa-moon").removeClass("fa-sun");
		$(".fa-moon").css({ "color": "black" });
		$(".fa-moon-ignore").css({ "color": "white" });
		$("#dark-mode-toggle-btn").css({ "color": "black" });
		$(".figure").css({ "-webkit-filter": "invert(0)", "filter": "invert(0)" });
		$(".featured-section").css({ "color": "black" });
		$(".mini-banner").css({ "color": "black" });
		$(".mini-banner-label").css({ "color": "black" });
		$(".subtopic-mini-banner-label").css({ "color": "black" });
		$(".website-title").css({ "color": "black" });
		$(".topic-title").css({ "color": "black" });
		$(".home-text-box").css({ "color": "black" });
		// $(".homepage-info").css({ "background-color": "white", "color": "black" });
		$(".homepage-icon").css({ "color": "#000000" });
		$(".homepage-static-section-buttons-label").css({ "color": "black" });
		$(".sliding-icon-label").css({ "color": "black" });
		$(".sliding-icon-update-label").css({ "color": "white" });
		$(".dedication-container").css({ "color": "black" });
	}
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