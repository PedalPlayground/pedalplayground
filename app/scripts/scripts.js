$(document).ready(function(){

    // Run function to ajax scope data
	GetScopeData();

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
		var pedal     = '<div class="pedal" style="width:'+width+'px;height:'+height+'px;" />';

		$('.pedalboard').append(pedal);
		$('.pedal').draggabilly({
			containment: '.pedalboard'
		});
		return false;
	});

	window.GetPedalData = function(){
		$.ajax({
			url: "resources/data/scopes.json",
			dataType: 'text',
			type: "GET",
			success: function(data){
				data = $.parseJSON(data.replace(/\r\n/g, "").replace(/\t/g, ""));
				var scopes = [];
				for(var scope in data){
					scopes.push( new Scope(
						data[scope].Name || "",
						data[scope].Type || "",
						data[scope].Manufacturer || "",
						data[scope].Description || "",
						data[scope].Icon || "",
						data[scope].Zoom || "",
						data[scope].Notes || "",
						data[scope].Image || [],
						data[scope].Stats || []
					));
				}
				RenderPedals(pedals);
			}
		});
	};

});