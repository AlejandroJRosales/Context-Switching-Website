var titleSection =
	`
	<div class="title-and-developer">
		<h1 class="page-title"></h1>
		<div class="other-contents-page-title reveal-title fade-in"> 
			<div class="page-header">
				<h4 class="developed-by-text">Written &#38; Coded by:</h4>
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
	<div class="oneai-button reveal reveal-oneai-button fade-right">
			<div class="panel-group">
			<div class="panel panel-default">
				<div class="panel-collapse collapse" id="oneai-collapse">

					<div class="content">

		<div class="chatbox">
			<p id="current-speaker">Jarcey A.I.</p>
			<!-- <hr> -->
			<p id="ai-response"></p>
		</div>

    <br>

		<div class="input-container">

			<div id="textbox-area"></div>

			<div class="homepage-buttons">
				<span>
					<!-- <button type="button" onclick="login()"><i class="fa-solid fa-user fa-xl" style="color: #ffffff;"></i></button> -->
					<!-- <button type="button" class="btn btn-sm" id="display-input-btn" onclick="displayLoginBox()"><i
							class="fa-solid fa-user fa-2xl" style="color: #ffffff;"></i></button>
					 <input type="password" id="user-id-box" placeholder="User ID"> -->
					<button type="button" class="btn btn-sm" id="speech-btn" onclick="toggleSpeech()"><i
							class="fa-solid fa-volume-xmark fa-2xl" style="color: #ffffff;"></i></button>
				</span>

				<button type="button" class="btn btn-sm" id="submit-query-btn" onclick="submitQuery()"><i
						class="fa-regular fa-paper-plane fa-2xl" style="color: #ffffff;"></i></button>
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
			</div>
			<button class="btn btn-primary oneai-contents-button" type="button" data-toggle="collapse" data-target="#oneai-collapse"
						aria-expanded="false" aria-controls="collapseExample" id="oneai-contents-button">
							<i class="fa-solid fa-robot" id="oneai-icon"></i>
				</button>
	</div>
</div>
`

var tableOfContentsCollapsible =
	`
<div class="contents-button-container" id="collapse-container">
	<div class="collapsible-contents-button reveal-button fade-in">
			<!-- <h4 class=reveal fade-right">Section<br>Links</h4> -->
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
<nav class="navbar navbar-expand-lg navbar-custom">
	<a class="nav-bar-brand" href="/">Context<br>Switching</a>
	<!-- <a class="nav-bar-creator" href="#"><br>by Alejandro Rosales</a> -->
	<button class="navbar-toggler custom-toggler" type="button" data-toggle="collapse" data-target="#navbarColor01"
		aria-controls="navbarColor01" aria-expanded="false" aria-label="Toggle navigation">
		<!-- <i class="fas fa-atom"></i> -->
		<!-- <i class="fab fa-cloudsmith"></i> -->
		<!-- <i class="fab fa-connectdevelop"></i> -->
		<!-- <span class="fab fa-connectdevelop"></span> -->
		<!-- <i class="fas fa-ellipsis-v"></i> -->
		<i class="fas fa-bars"></i>
	</button>
	<div class="collapse navbar-collapse" id="navbarColor01">
		<ul class="navbar-nav mr-auto">
			
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Theoretical Computer Science
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/tcs/quantummachinelearning">Quantum Enhanced Machine<br>Learning</a>
					<a class="dropdown-item" href="/tcs/informationtheory">Information Theory</a>
					<a class="dropdown-item" href="/tcs/multilevelcongitionforai">Multilevel Development of Cognitive<br>Abilities for Artificial Intelligence</a>
					<a class="dropdown-item" href="/tcs/quantumcomputingtheory">Quantum Computing Theory</a>
		 			<a class="dropdown-item" href="/tcs/graphtheory">Graph Theory</a>
		 			<a class="dropdown-item" href="/tcs/theoryofcomputation">Theory of Computation</a>
					<a class="dropdown-item" href="/tcs/algorithmicanalysis">Algorithmic Analysis</a>
					<hr>
					<p class="dropdown-item coming-soon-text">Topics to Come!</p>
					<a class="dropdown-item todo" href="/todo">Combinatorial and Stochastic Optimization</a>
					<!-- <a class="dropdown-item todo" href="/todo">Quantum Networks</a> -->
					<a class="dropdown-item todo" href="/todo">Combinatorics and Graph Theory</a>
					<!-- <a class="dropdown-item todo" href="/todo">P vs NP</a> -->
					<a class="dropdown-item todo" href="/todo">Approximation Algorithms</a>
					<a class="dropdown-item todo" href="/todo">Randomization Algorithms</a>
		 			<a class="dropdown-item todo" href="/todo">Pseudorandomness</a>
					<a class="dropdown-item todo" href="/todo">Algorithmic Game Theory</a>
			</li>
	 
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Mathematics
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/math/differentialmanifolds">Differential Manifolds</a>
					<a class="dropdown-item" href="/math/chernclass">Chern Class</a>
					<a class="dropdown-item" href="/math/hiddenmarkovprocesses">Hidden Markov Processes</a>
					<a class="dropdown-item" href="/math/abstractalgebra">Abstract Algebra</a>
		 			<a class="dropdown-item" href="/tcs/graphtheory">Graph Theory</a>
		 			<hr>
					<p class="dropdown-item coming-soon-text">Topics To Come!</p>
					<a class="dropdown-item todo" href="/todo">Approximation Functions</a>
				</div>
			</li>
	 
			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Neuroscience
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
					<a class="dropdown-item" href="/neuro/memoryformation">Neurobiological Bases of<br> Memory Formation</a>
		 			<a class="dropdown-item" href="/neuro/topologicalneuroscience">Topological Neuroscience</a>
					<a class="dropdown-item" href="/neuro/connectionsinhumanstructuralconnectome">Connections in the<br>Human Structural
				Connectome</a>
					<a class="dropdown-item" href="/neuro/anatomyandphysiologyhippocampus">Anatomy & Physiology of the<br>Hippocampus</a>
					<a class="dropdown-item" href="/neuro/multistorememory">Multi-Store Memory Model</a>
					<hr>
					<p class="dropdown-item coming-soon-text">Topics To Come!</p>
		 			<a class="dropdown-item todo" href="/todo">Veterinary Neuroanatomy</a>
		 			<a class="dropdown-item todo" href="/todo">Neocortex</a>
					<a class="dropdown-item todo" href="/todo">Working Memory</a>
		 			<a class="dropdown-item todo" href="/todo">Cerebral Cortex</a>
				</div>
			</li>

	<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					Miscellaneous
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
          <a class="dropdown-item" href="/misc/adsandeinsteinframes">Anti-de Sitter Space and Einstein Frames</a>
					<a class="dropdown-item" href="/misc/deontologyconsequentialismvirtueethics">Deontology, Consequentialism,<br>
				Virtue Ethics</a>
					<a class="dropdown-item" href="/misc/quantummechanics">Quantum Mechanics</a>
		 			<hr>
					<p class="dropdown-item coming-soon-text">Topics To Come!</p>
					<a class="dropdown-item todo" href="/todo">Geometrical Physics in Minkowski Spacetime</a>
					<a class="dropdown-item todo" href="/todo">Event Horizons:<br>Universe and Black Holes</a>
					<a class="dropdown-item todo" href="/todo">Utilitarianism</a>
				</div>
			</li>

			<li class="nav-item dropdown">
				<a class="nav-link dropdown-toggle" href="#" role="button" data-toggle="dropdown" aria-haspopup="true"
					aria-expanded="false">
					More On Me
				</a>
				<div class="dropdown-menu topics-dropdown-menu" aria-labelledby="navbarDropdown">
          <a class="dropdown-item" href="/my/aboutme">About Me</a>
          <a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/in/alejandro-rosales-36ab16191/">LinkedIn</a>
          <a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="/my/resume">Resume</a>
          <a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://github.com/AlejandroJRosales">GitHub</a>
					<a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="https://oneai.cloud/">My A.I. Assistant</a>
          <a class="dropdown-item" target="_blank" rel="noopener noreferrer" href="/my/projects/qsvm">Presentations (Beta Release)</a>
          <a class="dropdown-item" href="/my/projects">Live Code Projects (Beta Release)</a>
				</div>
			</li>
		</ul>
	<!--
		<br>
		<form class="form-inline navbar-search">
			<div class="btn btn-outline-light nav-search-div">
				<div class="nav-search-glyph">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-search"
						viewBox="0 0 16 16">
						<path
							d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z">
						</path>
					</svg>
				</div>
				<div class="nav-search-box-div" onclick="openSearch()">
					<input id="nav-search-box" placeholder="Search My Website"></input>
				</div>
			</div>
		</form>
	-->
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
            <a href="/explore"><i class="fa-regular fa-compass fa-lg" style="color: #ffffff;"></i>&nbsp;Explore</a>
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
		</div>
		<!-- Grid row-->

    <!-- Grid row-->
      <div class="footer-links row text-center d-flex justify-content-center pt-5 mb-3">
        <!-- Grid column -->
          <div class="col-md-2 mb-3">
            <p>
              <a href="/my/resume">Resume</a>
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

    <hr class="rgba-white-light" style="margin: 0 15%;">

		<!-- Grid row-->
		<div class="row d-flex text-center justify-content-center mb-md-0 mb-4">
			<!-- Grid column -->
			<div class="col-md-8 col-12 mt-5">
				<div class="footer-about-me">
					<h3 id="footer-about-me-title">Context Switching</h3>
		 			<br>
					<p style="line-height: 1.7rem">Welcome to my website! My
						name is Alejandro Rosales, and I coded this website from scratch. It's not much, but it's honest work. 
						My website provides a space for me to talk in-depth and teach about topics I am having fun learning about. I hope you enjoy your stay and Jarcey the A.I. will be here to assist you whenever!
					</p>

	 <hr class="rgba-white-light" style="margin: 0 15%;">

					<br>

	 				<p style="line-height: 1.7rem">Contact me at:<br>alejand.j.rosales@gmail.com
					</p>
				</div>
			</div>
			<!-- Grid column -->
		</div>
	</div>
</footer>
<!-- Footer -->
`