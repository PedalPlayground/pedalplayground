$(document).ready(function(){

    // Run function to ajax scope data
	GetPedalData();

	var multiplier = "15";

	var $draggable = $('.pedal').draggabilly({
		containment: '.pedalboard'
	})

	$('body').on('click', 'a', function(){
		$('.pedalboard').css('border','1px solid red').width(1000).height(768).append('<div class="pedal" />');
		$('.pedal').draggabilly({
			containment: '.pedalboard'
		});
	});

	$('body').on('click', '#add-pedal button', function(){
		var selected  = $('#add-pedal').find(":selected");
		var width  	  = $(selected).data("width") * multiplier;
		var height    = $(selected).data("height") * multiplier;
		var image  	  = $(selected).data("image");
		var pedal     = '<div class="pedal" style="width:'+width+'px;height:'+height+'px; background-image:url('+image+')" />';

		$('.pedalboard').append(pedal);
		$('.pedal').draggabilly({
			containment: '.pedalboard'
		});
		return false;
	});


});

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
			RenderPedals(pedals);
			console.log("ajax success");
		}
	});
};

window.RenderPedals = function(pedals){
	console.log('RenderPedals');
	for(var i in pedals) {
		// <option id="bd-2" data-width="2.75" data-height="5">Blues Driver</option>
		// <option id="dd-500" data-width="6.75" data-height="5.44">DD-500</option>
		// <option id="fv-30" data-width="3.15" data-height="7.56">FV-30L</option>

		var $pedal = $("<option>"+ pedals[i].Brand + " " + pedals[i].Name +"</option>").attr('id', pedals[i].Name.toLowerCase().replace(/\s+/g, "-").replace(/'/g, ''));

		$pedal.data('width', pedals[i].Width);
		$pedal.data('height', pedals[i].Height);
		$pedal.data('height', pedals[i].Height);
		$pedal.data('image', pedals[i].Image);

		$pedal.appendTo('.pedal-list');
	}
}
