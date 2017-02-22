$(document).ready(function(){

	GetPedalData();

	var multiplier = "20";

	$('.canvas').css('background-size', multiplier + 'px')

	var $draggable = $('.pedal').draggabilly({
		containment: '.canvas'
	})

	$('body').on('click', '#add-pedal button', function(){
		var selected  = $('#add-pedal').find(":selected");
		var width  	  = $(selected).data("width") * multiplier;
		var height    = $(selected).data("height") * multiplier;
		var image  	  = $(selected).data("image");
		var pedal     = '<div class="pedal p" style="width:'+width+'px;height:'+height+'px; background-image:url('+image+')"><a href="#"></a></div>';
		//var pedal     = '<div class="pedal"></div>';

		//$(pedal).css({
		//	"width": width,
		//	"height": height,
		//	"background-image": 'url(' + image + ')'
		//}).append('<a class="delete">&times;</a>');

		$('.canvas').append(pedal);

		$('.pedal').draggabilly({
			containment: '.canvas'
		});
		return false;
	});

	$('body').on('click', '.pedal a', function(){
	    $(this).parents('.pedal').remove();
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
		var $pedal = $("<option>"+ pedals[i].Brand + " " + pedals[i].Name +"</option>").attr('id', pedals[i].Name.toLowerCase().replace(/\s+/g, "-").replace(/'/g, ''));
		$pedal.data('width', pedals[i].Width);
		$pedal.data('height', pedals[i].Height);
		$pedal.data('height', pedals[i].Height);
		$pedal.data('image', pedals[i].Image);
		$pedal.appendTo('.pedal-list');
	}
}

window.PedalBoard = function( type, brand, name, width, height, image ){
	this.Type = type || "";
	this.Brand = brand || "";
	this.Name = name || "";
	this.Width = width || "";
	this.Height = height || "";
	this.Image = image || "";
}

window.GetPedalBoardData = function(){
	console.log('GetPedalData');
	$.ajax({
		url: "public/data/pedalboards.json",
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
