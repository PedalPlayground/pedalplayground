<!DOCTYPE html>
<head>
	<title></title>
	<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
	<link rel="icon" href="favicon.ico">
	<link rel="stylesheet" href="site-prod/stylesheets/styles.css">
	<script type="text/javascript" src="site-prod/scripts/scripts.js"></script>
</head>
<!-- !Body -->
<body>
	<div class="sidebar">
		<div class="sidebar__section">
			<h4>Add a Pedal</h4>
			<form id="add-pedal">
				<select>
					<optgroup label="BOSS">
						<option id="bd-2" data-width="2.75" data-height="5">Blues Driver</option>
						<option id="dd-500" data-width="6.75" data-height="5.44">DD-500</option>
						<option id="fv-30" data-width="3.15" data-height="7.56">FV-30L</option>
					</optgroup>
					<optgroup label="Strymon">
						<option id="timeline" data-width="6.75" data-height="5">Timeline</option>
						<option id="blue-sky" data-width="3.5" data-height="5.4">Blue Sky</option>
					</optgroup>
				</select>
				<button>Add Pedal</button>
			</form>
		</div>
	</div>
	<div class="pedalboard">
		<div class="pedal"></div>
	</div>
</body>
</html>
