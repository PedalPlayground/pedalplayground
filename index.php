<!DOCTYPE html>
<head>
	<title></title>
	<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
	<link rel="icon" href="favicon.ico">
	<link rel="stylesheet" href="public/stylesheets/styles.css">
	<script type="text/javascript" src="public/scripts/scripts.js"></script>
</head>
<!-- !Body -->
<body>
	<header class="site-header">
		<h1><b>Pedal</b> Playground</h1>
	</header>
	<div class="site-body">
		<div class="sidebar">
			<div class="sidebar__section">
				<h4>Add a Pedal</h4>
				<form id="add-pedal">
					<p><select class="pedal-list form-control"></select></p>
					<button class="btn btn-primary btn-block">Add Pedal</button>
				</form>
				<hr>
				<h4>Add Custom Pedal</h4>
				<form id="add-custom-pedal">
					<p>

							<input type="number" class="custom-width form-control" placeholder="Width (inches.)">

							<input type="number" class="custom-height form-control" placeholder="Height (inches)">
					</p>

					<p>
						<label>Color</label>
						<div class="input-group">
							<input class="custom-color " type="color" name="favcolor" value="#AC203B">
						</div>
					</p>

					<button class="btn btn-primary btn-block">Add Pedal</button>
				</form>
			</div>
		</div>
		<div class="canvas">
			<div class="pedalboard"></div>
		</div>
	</div>
	<header class="site-footer">
		<h1>Thingy</h1>
	</header>
</body>
</html>
