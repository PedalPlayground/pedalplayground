var pedalImagePath 		= "public/images/pedals/";
var pedalboardImagePath = "public/images/pedalboards/";

$(document).ready(function(){


	// Populate Pedalboards and Pedals lists
	GetPedalData();
	GetPedalBoardData();

	// Make lists searchable
	$('.pedal-list').select2({
		placeholder: "Select a pedal",
	});
	
	$('.pedal-list').on('select2:select', function (e) {
		$("#add-selected-pedal").click();
		$(this).trigger('change').focus();
		//$(this).val(null).trigger('change').focus();
	});

	
	$('.pedalboard-list').select2({
		placeholder: "Select a pedalboard",
	});
	
	$('.pedalboard-list').on('select2:select', function (e) {
		$("#add-selected-pedalboard").click();
		$(this).trigger('change').focus();
		//$(this).val(null).trigger('change').focus();
	});

	// Load canvas from localStorage if it has been saved prior
	$(function() {
		if (localStorage["pedalCanvas"] != null) {
			var savedPedalCanvas = JSON.parse(localStorage["pedalCanvas"]);
			$(".canvas").html(savedPedalCanvas);
			readyCanvas();
			console.log("Canvas restored!");
		}
	});

	// Set the multiplier for converting inches to pixels
	var multiplier = 16;
	var screenSize = $(window).width();
	if ( screenSize > 1023 ) {
		var multiplier = 20;
	} if ( screenSize > 1600 ) {
		var multiplier = 25;
	}

	console.log("1 inch = " + multiplier + "px");

	// Set grid background to one inch
	$('.canvas').css('background-size', multiplier + 'px');

	// // Make pedals draggable
	// var $draggable = $('.canvas .pedal, .canvas .pedalboard').draggabilly({
	// 	containment: '.canvas'
	// });

	// Activate canvas features
	//$('body').on('click', '#clear-canvas', function(){
	//	$('#clear-canvas-modal').modal('show');
	//});

	$('body').on('click', '#clear-canvas-confirmation', function(){
		$(".canvas").empty();
		$('#clear-canvas-modal').modal('hide')
		savePedalCanvas();
	});

	$('body').on('click', '#add-pedal button', function(event){
		var selected  	= $('#add-pedal').find(":selected");
		var name 		= $(selected).text();
		var shortname 	= $(selected).attr("id");
		var w	 	  	= $(selected).data("width") * multiplier;
		var h   		= $(selected).data("height") * multiplier;
		var i 	  		= $(selected).data("image");
		var pedal     	= '\
<div class="pedal '+shortname+'">\
	<div class="artwork" style="width:'+w+'px;height:'+h+'px; background-image:url('+ pedalImagePath + i +')"></div>\
	<div class="actions">\
		<a class="rotate"></a>\
		<a class="delete"></a>\
	</div>\
</div>';
		$('.canvas').append(pedal);
		readyCanvas();
		ga('send', 'event', 'Pedal', 'added', name);
		event.preventDefault();
	});

	$('body').on('click', '#add-pedalboard button', function(event){
		var selected  = $('#add-pedalboard').find(":selected");
		var name 		= $(selected).text();
		var shortname 	= $(selected).attr("id");
		var w	 	  	= $(selected).data("width") * multiplier;
		var h   		= $(selected).data("height") * multiplier;
		var i 	  		= $(selected).data("image");
		var pedal     	= '\
<div class="pedalboard '+shortname+'">\
	<div class="artwork" style="width:'+w+'px;height:'+h+'px; background-image:url(' + pedalboardImagePath + i + ')"></div>\
	<div class="actions">\
		<a class="rotate"></a>\
		<a class="delete"></a>\
	</div>\
</div>';

		$('.canvas').append(pedal);
		readyCanvas();
		ga('send', 'event', 'Pedalboard', 'added', name);
		event.preventDefault();
	});

	// Activate color picker plugin on custom color field
	$('.custom-color-block').colorpicker({
		color: '#41C74D'
	});

	// Add custom pedal
	$('body').on('click', '#add-custom-pedal .btn', function(event){
		var truewidth   = $("#add-custom-pedal .custom-width").val();
		var trueheight  = $("#add-custom-pedal .custom-height").val();
		var name 		= $("#add-custom-pedal .custom-name").val();

		$("#add-custom-pedal .invalid").removeClass("invalid");

		if ( truewidth == "" || trueheight == "" ) {
			$("#add-custom-pedal .custom-height, #add-custom-pedal .custom-width").addClass("invalid");
			$("#add-custom-pedal .custom-width").focus();
		} else if ( truewidth == "" ) {
			$("#add-custom-pedal .custom-width").addClass("invalid").focus();
		} else if ( trueheight == "" ) {
			$("#add-custom-pedal .custom-height").addClass("invalid").focus();
		} else {
			console.log("add custom pedal...");
			var width  	   = truewidth * multiplier;
			var height     = trueheight * multiplier;
			var dims  	   = truewidth + '" x ' + trueheight + '"';
			var image  	   = $("#add-custom-pedal .custom-color").val();
			var pedal      = '<div class="pedal pedal--custom" style="width:' + width + 'px;height:' + height + 'px;">\
			<span class="pedal__box" style="background-color:' + image + ';"></span>\
			<span class="pedal__name">' + name + '</span>\
			<span class="pedal__jack1"></span>\
			<span class="pedal__jack2"></span>\
			<span class="pedal__knob1"></span>\
			<span class="pedal__knob2"></span>\
			<span class="pedal__led"></span>\
			<span class="pedal__switch"></span>\
			<div class="actions">\
			<a class="rotate"></a>\
			<a class="delete"></a>\
			</div>\
			</div>';

			$('.canvas').append(pedal);
			readyCanvas();
			console.log(dims);
			ga('send', 'event', 'CustomPedal', 'added', dims + " " + name);
			event.preventDefault();
		}
	});


	// Add custom pedalboard
	$('body').on('click', '#add-custom-pedalboard .btn', function(event){
		var truewidth   = $("#add-custom-pedalboard .custom-width").val();
		var trueheight  = $("#add-custom-pedalboard .custom-height").val();

		$("#add-custom-pedalboard .invalid").removeClass("invalid");

		if ( truewidth == "" || trueheight == "" ) {
			$("#add-custom-pedalboard .custom-height, #add-custom-pedalboard .custom-width").addClass("invalid");
			$("#add-custom-pedalboard .custom-width").focus();
		} else if ( truewidth == "" ) {
			$("#add-custom-pedalboard .custom-width").addClass("invalid").focus();
		} else if ( trueheight == "" ) {
			$("#add-custom-pedalboard .custom-height").addClass("invalid").focus();
		} else {
			console.log("add custom pedalboard...");
			var width  	   = truewidth * multiplier;
			var height     = trueheight * multiplier;
			var dims  	   = truewidth + '" x ' + trueheight + '"';
			var pedalboard = '<div class="pedalboard pedalboard--custom" style="width:' + width + 'px;height:' + height + 'px; border-width:'+ multiplier / 2 +'px">\
			<div class="actions">\
			<a class="delete"></a>\
			</div>\
			</div>';

			$('.canvas').append(pedalboard);
			readyCanvas();
			ga('send', 'event', 'CustomPedalboard', 'added', dims + " " + name);
			event.preventDefault();
		}
	});

	// Delete Pedals
	//$('body').on('click', '.canvas .delete', function(){
	//    $(this).parents('.pedal, .pedalboard').remove();
	//	readyCanvas();
	//});

	// Rotate Pedals
	//$('body').on('click', '.pedal .rotate', function(){
	//	if ( $(this).hasClass("rotate-90") ) {
	//		$(this).removeClass("rotate-90");
	//		$(this).addClass("rotate-180");
	//	} else if ( $(this).hasClass("rotate-180") ) {
	//		$(this).removeClass("rotate-180");
	//		$(this).addClass("rotate-270");
	//	}  else if ( $(this).hasClass("rotate-270") ) {
	//		$(this).removeClass("rotate-270");
	//	} else {
	//		$(this).addClass("rotate-90");
	//	}
	//	return false;
	//});



}); // End Document ready

function readyCanvas(pedal) {
	var $draggable = $('.canvas .pedal, .canvas .pedalboard').draggabilly({
		containment: '.canvas'
	});

	$('.canvas .pedal, .canvas .pedalboard').draggabilly({
		containment: '.canvas'
	});

	$draggable.on( 'dragEnd', function() {
		console.log('dragEnd');
		ga('send', 'event', 'Canvas', 'moved', 'dragend');
		savePedalCanvas();
	});

	$draggable.on( 'staticClick', function(event) {
		//rotatePedal(this);
		var target = $(event.target);
	    if(target.is('.delete')) {
			deletePedal(this);
	    } else if (target.is('.rotate')) {
			//rotatePedal(this);
			if ( $(this).hasClass("rotate-90") ) {
				$(this).removeClass("rotate-90");
				$(this).addClass("rotate-180");
			} else if ( $(this).hasClass("rotate-180") ) {
				$(this).removeClass("rotate-180");
				$(this).addClass("rotate-270");
			}  else if ( $(this).hasClass("rotate-270") ) {
				$(this).removeClass("rotate-270");
			} else {
				$(this).addClass("rotate-90");
			}
	    }
	});
	savePedalCanvas();
}

function savePedalCanvas() {
	console.log("Canvas Saved!");
	localStorage["pedalCanvas"] = JSON.stringify($(".canvas").html());
}

function rotatePedal(pedal) {
	ga('send', 'event', 'Pedal', 'clicked', "rotate");
	if ( $(pedal).hasClass("rotate-90") ) {
		$(pedal).removeClass("rotate-90");
		$(pedal).addClass("rotate-180");
	} else if ( $(pedal).hasClass("rotate-180") ) {
		$(pedal).removeClass("rotate-180");
		$(pedal).addClass("rotate-270");
	}  else if ( $(pedal).hasClass("rotate-270") ) {
		$(pedal).removeClass("rotate-270");
	} else {
		$(pedal).addClass("rotate-90");
	}
	savePedalCanvas();
}

function deletePedal(pedal) {
	$(pedal).remove();
	savePedalCanvas();
}

// function rotatePedal() {
// 	alert("rotate Pedal");
// 	if ( $(this).hasClass("rotate-90") ) {
// 		$(this).removeClass("rotate-90");
// 		$(this).addClass("rotate-180");
// 	} else if ( $(this).hasClass("rotate-180") ) {
// 		$(this).removeClass("rotate-180");
// 		$(this).addClass("rotate-270");
// 	}  else if ( $(this).hasClass("rotate-270") ) {
// 		$(this).removeClass("rotate-270");
// 	} else {
// 		$(this).addClass("rotate-90");
// 	}
// 	return false;
// }

window.Pedal = function( type, brand, name, width, height, image ){
	this.Type = type || "";
	this.Brand = brand || "";
	this.Name = name || "";
	this.Width = width || "";
	this.Height = height || "";
	this.Image = image || "";
}

window.GetPedalData = function(){
	console.log('GetPedalData');
	$.ajax({
		url: "public/data/pedals.json",
		dataType: 'text',
		type: "GET",
		success: function(data){
			data = $.parseJSON(data.replace(/\r\n/g, "").replace(/\t/g, ""));
			var pedals = [];
			for(var pedal in data){
				pedals.push( new Pedal(
					data[pedal].Type 	|| "",
					data[pedal].Brand 	|| "",
					data[pedal].Name 	|| "",
					data[pedal].Width 	|| "",
					data[pedal].Height 	|| "",
					data[pedal].Image 	|| ""
				));
			}
			//Sort brands and pedals alphabetically
			pedals.sort(function(a,b) {
				if (a.Brand < b.Brand) {
					return -1;
				} else if (b.Brand < a.Brand) {
					return 1;
				} else {
					if (a.Name < b.Name) {
						return -1;
					} else if (b.Name < a.Name) {
						return 1;
					}
					return 0;
				}
			});
			pedals.forEach(RenderPedals);
			listPedals(pedals);
		}
	});
};

window.RenderPedals = function(pedals) {
    var { Type, Brand, Name, Width, Height, Image } = pedals;
    var option = $("<option>", {
        text: `${Brand} ${Name}`,
        id: `${Name.toLowerCase().replace(/(\s+)|(['"])/g, (m, p1, p2) => p1 ? "-" : "")}`,
        data: {
            width: Width,
            height: Height,
            image: Image
        }
    });
    if ($("optgroup").is(`[label="${Brand}"]`)) {
        $(`optgroup[label="${Brand}"]`).append(option);
    } else {
        $("<optgroup>", {
            label: Brand,
            html: option
        }).appendTo(".pedal-list");
    }
}

window.PedalBoard = function( brand, name, width, height, image ){
	this.Brand = brand || "";
	this.Name = name || "";
	this.Width = width || "";
	this.Height = height || "";
	this.Image = image || "";
}

window.GetPedalBoardData = function(){
	console.log('GetPedalBoardData');
	$.ajax({
		url: "public/data/pedalboards.json",
		dataType: 'text',
		type: "GET",
		success: function(data){
			data = $.parseJSON(data.replace(/\r\n/g, "").replace(/\t/g, ""));
			var pedalboards = [];
			for(var pedalboard in data){
				pedalboards.push( new PedalBoard(
					data[pedalboard].Brand 	|| "",
					data[pedalboard].Name 	|| "",
					data[pedalboard].Width 	|| "",
					data[pedalboard].Height || "",
					data[pedalboard].Image 	|| ""
				));
			}
			console.log("Pedalboard data loaded");
			//Sort brands and pedals alphabetically
			pedalboards.sort(function(a,b) {
				if (a.Brand < b.Brand) {
					return -1;
				} else if (b.Brand < a.Brand) {
					return 1;
				} else {
					if (a.Name < b.Name) {
						return -1;
					} else if (b.Name < a.Name) {
						return 1;
					}
					return 0;
				}
			});
			RenderPedalBoards(pedalboards);
		}
	});
};

window.RenderPedalBoards = function(pedalboards){
	console.log('RenderPedalBoards');
	for(var i in pedalboards) {
		var $pedalboard = $("<option>"+ pedalboards[i].Brand + " " + pedalboards[i].Name +"</option>").attr('id', pedalboards[i].Name.toLowerCase().replace(/\s+/g, "-").replace(/'/g, ''));
		$pedalboard.data('width', pedalboards[i].Width);
		$pedalboard.data('height', pedalboards[i].Height);
		$pedalboard.data('height', pedalboards[i].Height);
		$pedalboard.data('image', pedalboards[i].Image);
		$pedalboard.appendTo('.pedalboard-list');
	}
}

// List pedals on page to find errors
window.listPedals = function(pedals){
	if ( $('#list-pedals').length ) {
		console.log('List pedals...');
		for(var i in pedals) {
			multiplier = 40;
			Width   = pedals[i].Width  * multiplier;
			Height  = pedals[i].Height * multiplier;

			var $pedalListing = $('<div class="pedal-listing">\
				<img src="' + pedalImagePath + pedals[i].Image + '" alt="' + pedals[i].Brand + " " + pedals[i].Name + '" width="' + Width + '" height="' + Height + '"/>\
				<p class="pedal-brand">' + pedals[i].Brand + '</p>\
				<p class="pedal-name">' + pedals[i].Name + '</p>\
			</div>');
			// $pedalListing.css('width', pedals[i].Width);
			// $pedalListing.css('height', pedals[i].Height);
			// $pedalListing.css('background-image', "url(" + pedals[i].Image + ")" );
			$pedalListing.appendTo('#list-pedals');
		}
	}
}
