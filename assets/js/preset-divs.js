var titleSection =
	`
	<div class="title-and-developer">
		<h2 class="page-title"></h2>
		<div class="other-contents-page-title reveal-title fade-in"> 
			<div class="page-header">
				<h4 class="developed-by-text">Created and Edited by</h4>
				<p class="page-developer" id="developer-title"><a href="/my/aboutme">Alejandro Rosales</a></p>
		 	</div>
		<div style="padding-top:2%;text-align:center;"><button id="dark-mode-toggle-btn" onclick="toggleDarkMode()"><i
			 class="fas fa-moon fa-xl reveal-moon fade-up"></i></button></div>
		</div>
	</div>
`

var exploreSection =
	`
<div>
  <h3 class="explore-section"><i class="fa-regular fa-compass fa-beat-fade fa-lg homepage-icon" style="color: #ffffff;"></i>&nbsp;<a href="/explore">Explore</a>
    <div class="explore-text-box">
      <p class="homepage-info">
        Explore more topics!
      </p>
    </div>
  </h3>
</div>
`

var topicPageTitleSection =
	`
  <div class="reveal-website-opener reveal-title fade-in">
    <div class="website-intro"
      style="color: #777;background-color:white;text-align:center;padding:50px 80px;text-align: center;">
      <p class="topic-title">Neuroscience</p>
      <div class="other-contents-page-title"> 
        <div style="padding-top:2%;text-align:center;"><button id="dark-mode-toggle-btn" onclick="toggleDarkMode()"><i
           class="fas fa-moon fa-xl reveal-moon fade-up"></i></button>
        </div>
      </div>
    </div>
  </div>
`

var oneaiDiv =
	`
	<link rel="stylesheet" href="/assets/oneai/style.css">
<div class="oneai-contents-button-container">
	<!-- <div class="oneai-button"> -->
	<div class="oneai-button">
			<div class="panel-group">
			<div class="panel panel-default">
				<div class="panel-collapse collapse" id="oneai-collapse">
				<div class="content">

		<div class="chatbox">
			<p id="ai-response"></p>
		</div>

		<br>

		<div class="input-container"">

			<div id="textbox-area"></div>

			<div class="homepage-buttons">
					<span style="float:left;">
          			<button id="dark-mode-toggle-btn-ignore" onclick="toggleDarkMode()"><i class="fas fa-moon fa-moon-ignore fa-2xl dark-mode-toggle-btn-ignore"></i></button>
				  <button onclick="topOfPage()" class="top-of-page"><i class="fa-solid fa-angles-up fa-2xl" style="color: #ffffff;"></i></button>
					<!-- <button type="button" class="btn btn-sm" id="speech-btn" onclick="toggleSpeech()"><i
							class="fa-solid fa-volume-xmark fa-2xl" style="color: #ffffff;"></i></button> -->
					</span>
					<span style="float:right;">
					<button type="button" class="btn btn-sm" id="submit-query-btn" onclick="submitQuery()"><i
						class="fa-regular fa-paper-plane fa-2xl" style="color: #ffffff;"></i></button>
					</span>
			</div>
		</div>

		<br>
		<!-- oneai scripts -->
		<script src="/assets/oneai/tts.js"></script>
		<script src="/assets/oneai/utils.js"></script>
		<script src="/assets/oneai/driver.js"></script>
		<script src="/assets/oneai/submission-pipeline.js"></script>
	</div>

			</div>
				<button class="btn btn-primary oneai-contents-button" type="button" data-toggle="collapse" data-target="#oneai-collapse"
						aria-expanded="false" aria-controls="collapseExample" id="oneai-contents-button">
							<svg width="34" height="34" viewBox="0 0 64 64" fill="none">
								<!-- Main sparkle -->
								<path d="M32 6 L36 26 L58 32 L36 38 L32 58 L28 38 L6 32 L28 26 Z"
									fill="currentColor"/>

								<!-- Small sparkle (top-right) -->
								<path d="M48 8 L50 16 L58 18 L50 20 L48 28 L46 20 L38 18 L46 16 Z"
									fill="currentColor"/>
							</svg>
				</button>
			</div>
</div>
`

var tableOfContentsCollapsible =
	`
<div class="contents-button-container" id="collapse-container">
	<div class="collapsible-contents-button reveal-button fade-in fade-out-right">
			<div class="panel-group">
				<div class="panel panel-default">
					<div class="panel-collapse collapse" id="collapse">

						<div class="table-of-contents-collapsible"></div>

						<! -- TODO: add below br and li to new var collapsePageBottomink -->
						<br>

					</div>
				</div>
				<button class="btn btn-primary contents-button" type="button" data-toggle="collapse" data-target="#collapse"
						aria-expanded="false" aria-controls="collapseExample" id="contents-button">
							<i class="far fa-list-alt" id="table-of-contents-icon"></i>
				</button>
			</div>
	</div>
</div>
<div class="oneai-div"></div>
`

var navbar =
	`
<nav class="navbar navbar-expand-lg navbar-custom" id="top-of-page">
	<a class="nav-bar-brand" href="/">Context<br>Switching</a>
	<button class="navbar-toggler custom-toggler" type="button" data-toggle="collapse" data-target="#navbarColor01"
		aria-controls="navbarColor01" aria-expanded="false" aria-label="Toggle navigation">
		<i class="fas fa-bars"></i>
	</button>
	<div class="collapse navbar-collapse" id="navbarColor01">
		<ul class="navbar-nav mr-auto">
			
			<li class="nav-item">
				<a class="nav-link" href="/cs">Computer Science</a>
			</li>

			<li class="nav-item">
				<a class="nav-link" href="/math">Mathematics</a>
			</li>

			<li class="nav-item">
				<a class="nav-link" href="/neuro">Neuroscience</a>
			</li>

			<li class="nav-item">
				<a class="nav-link" href="/phys">Physics</a>
			</li>

			<li class="nav-item">
				<a class="nav-link" href="/general">General</a>
			</li>

			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					About Me
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/my/aboutme">About Me</a>
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="/my/resume">Resume</a>
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="/my/cv">CV</a>
					<a class="dropdown-item" href="/my/researchandwork">Research and Projects</a>
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/in/alejandro-rosales-36ab16191/">LinkedIn</a>
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://github.com/AlejandroJRosales">GitHub</a>
					<a class="dropdown-item" href="/my/world/">Ecosystem Simulation</a>
					<a class="dropdown-item" href="/my/mat/">Brain Simulation</a>
				</div>
			</li>

		</ul>
		<br>
	</div>
</nav>
`

var navDarkModeBttn = '<div class="navbar-item dark-mode-toggle-div"><button id="dark-mode-toggle-btn" onclick="toggleDarkMode()"><i class="fas fa-moon fa-2xl"></i></button></div>'

var footer =
	`
<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.13.0/css/all.css">

<!-- Footer -->
<footer class="page-footer font-small" class="footer">
	<!-- Footer Links -->
	<div class="container">
		<!-- Grid row-->
		<div class="footer-links row text-center d-flex justify-content-center pt-5 mb-3">

			<!-- Grid column -->
			<div class="col-md-2 mb-3">
			<p>
				<a href="/explore">Explore</a>
			</p>
			</div>
			<!-- Grid column -->
    
			<!-- Grid column -->
			<div class="col-md-2 mb-3">
				<p>
					<a target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/in/alejandro-rosales-36ab16191/">Linked <i class="fa-brands fa-linkedin fa-lg" style="color: #ffffff;"></i></a>
				</p>
			</div>
			<!-- Grid column -->

			<!-- Grid column -->
			<div class="col-md-2 mb-3">
				<p>
					<a target="_blank" rel="noopener noreferrer" href="https://github.com/AlejandroJRosales"><i class="fa-brands fa-github fa-lg" style="color: #ffffff;"></i> GitHub</a>
				</p>
			</div>
			<!-- Grid column -->

			<!-- Grid column -->
			<div class="col-md-2 mb-3">
			<p>
				<a href="/my/aboutme">About Me</a>
			</p>
			</div>
			<!-- Grid column -->

      </div>
      <!-- Grid row-->

		<!-- Grid row-->
		<div class="row d-flex text-center justify-content-center mb-md-0 mb-4">
			<!-- Grid column -->
			<div class="col-md-8 col-12 mt-5">
				<div class="footer-about-me">
	 				<p style="line-height: 1.7rem">Contact me
			<br><br><i class="fa-solid fa-envelope"></i> <b>Email:</b> alejand.j.rosales@gmail.com
			<br><i class="fa-solid fa-phone"></i> <b>Phone:</b> +16149064179
					</p>
				</div>
			</div>
			<!-- Grid column -->
		</div>
	</div>
</footer>
<!-- Footer -->
`