var pedalImagePath = "public/images/pedals/";
var pedalboardImagePath = "public/images/pedalboards/";

const UNITS_IN = 'in.';
const UNITS_MM = 'mm.';

$(document).ready(function () {
  // Populate Pedalboards and Pedals lists
  GetPedalData();
  GetPedalBoardData();
  convertUnits();

  // Make lists searchable
  $(".pedal-list").select2({
    placeholder: "Select a pedal",
    width: "style",
  });

  $(".pedal-list").on("select2:select", function (e) {
    $("#add-selected-pedal").click();
    $(this).trigger("change").focus();
    //$(this).val(null).trigger('change').focus();
  });

  $(".pedalboard-list").select2({
    placeholder: "Select a pedalboard",
    width: "style",
  });

  $(".pedalboard-list").on("select2:select", function (e) {
    $("#add-selected-pedalboard").click();
    $(this).trigger("change").focus();
    //$(this).val(null).trigger('change').focus();
  });

  $(function () {
    // The switchButton plugin isn't loaded by index.html
    if ($.fn.switchButton) {
      $("#input-unit-pb").switchButton({
        checked: true,
        on_label: UNITS_IN,
        off_label: UNITS_MM,
        width: 50,
        height: 12,
        button_width: 35,
      })

      $("#input-unit-pd").switchButton({
        checked: true,
        on_label: UNITS_IN,
        off_label: UNITS_MM,
        width: 50,
        height: 12,
        button_width: 35,
      })
    }

    // Load canvas from localStorage if it has been saved prior
    if (localStorage["pedalCanvas"] != null) {
      var savedPedalCanvas = JSON.parse(localStorage["pedalCanvas"]);
      $(".canvas").html(savedPedalCanvas);
      readyCanvas();
    }

    // If hidden multiplier value doesn't exist, create it
    if ($("#multiplier").length == 0) {
      $(".canvas").append('<input id="multiplier" type="hidden" value="25">');
      var multiplier = 25;
      // If hidden multiplier value does exist set variable
    } else {
      var multiplier = $("#multiplier").val();
    }
    // Set canvas scale input and bg size to match scale
    $("#canvas-scale").val(multiplier);
    $(".canvas").css("background-size", multiplier + "px");
  });

  $("#convert-units").on("change", function () {
    convertUnits();
  });

  // When user changes scale, update stuffs
  $("#canvas-scale").change(function () {
    // update var
    var multiplier = $(this).val();
    $("#multiplier").val(multiplier);

    // Update scale of bg image
    $(".canvas").css("background-size", multiplier + "px");

    // Update all items with stored scale
    $(".item").each(function () {
      $(this).attr("data-scale", multiplier);
    });

    // Update regular Pedals
    $(".pedalboard").each(function () {
      var scaledWidth = $(this).data("width") * multiplier;
      var scaledHeight = $(this).data("height") * multiplier;
      $(this).find(".artwork").css("width", scaledWidth).css("height", scaledHeight);
    });

    // Update regular Pedals
    $(".pedal, .pedalboard").each(function () {
      var scaledWidth = $(this).data("width") * multiplier;
      var scaledHeight = $(this).data("height") * multiplier;
      $(this).find(".artwork").css("width", scaledWidth).css("height", scaledHeight);
    });

    // Update custom pedals
    $(".pedal--custom, .pedalboard--custom").each(function () {
      var scaledWidth = $(this).data("width") * multiplier;
      var scaledHeight = $(this).data("height") * multiplier;
      $(this).css("width", scaledWidth).css("height", scaledHeight);
    });
    $(".pedalboard--custom").each(function () {
      var scaledWidth = $(this).data("width") * multiplier;
      var scaledHeight = $(this).data("height") * multiplier;
      $(this).css({
        width: scaledWidth,
        height: scaledHeight,
        borderWidth: multiplier * 0.5,
      });
    });

    savePedalCanvas();
  });

  $("body").on("click", ".sidebar-open", function (e) {
    $(".site-body").addClass("is-slid");
    e.preventDefault();
  });

  $("body").on("click", ".sidebar-close", function (e) {
    $(".site-body").removeClass("is-slid");
    e.preventDefault();
  });

  $("body").on("click", "#save-canvas", function (e) {
    const currentDate = new Date().toLocaleDateString() + new Date().toLocaleTimeString();

    downloadPedalCanvas("Pedal Playground - " + currentDate + ".json");
  });

  $("body").on("click", "#load-canvas", function (e) {
    uploadPedalCanvas();
  });

  $("body").on("click", "#clear-canvas-confirmation", function () {
    $(".canvas").empty();
    $("#clear-canvas-modal").modal("hide");
    savePedalCanvas();
  });

  $("body").on("click", "#add-pedal button", function (event) {
    var multiplier = $("#canvas-scale").val();
    var serial = GenRandom.Job();
    var selected = $("#add-pedal").find(":selected");
    var name = $(selected).text();
    var shortname = $(selected).attr("id");
    var width = $(selected).data("width");
    var height = $(selected).data("height");
    var scaledWidth = $(selected).data("width") * multiplier;
    var scaledHeight = $(selected).data("height") * multiplier;
    var i = $(selected).data("image");
    var pedal =
      '\
<div id="item-' +
      serial +
      '" class="item pedal ' +
      shortname +
      '" title="' +
      name +
      '" data-width="' +
      width +
      '" data-height="' +
      height +
      '" data-scale="' +
      multiplier +
      '">\
    <div class="artwork" style="width:' +
      scaledWidth +
      "px;height:" +
      scaledHeight +
      "px; background-image:url(" +
      pedalImagePath +
      i +
      ')"></div>\
    <div class="shadow"></div>\
    <div class="actions">\
        <a class="rotate"></a>\
        <a class="delete"></a>\
    </div>\
</div>';
    $(".canvas").append(pedal);
    readyCanvas();
    ga("send", "event", "Pedal", "added", name);
    event.preventDefault();
  });

  $("body").on("click", "#add-pedalboard button", function (event) {
    var serial = GenRandom.Job();
    var multiplier = $("#canvas-scale").val();
    var selected = $("#add-pedalboard").find(":selected");
    var name = $(selected).text();
    var shortname = $(selected).attr("id");
    var width = $(selected).data("width");
    var height = $(selected).data("height");
    var scaledWidth = $(selected).data("width") * multiplier;
    var scaledHeight = $(selected).data("height") * multiplier;
    var i = $(selected).data("image");
    var pedal =
      '\
<div id="item-' +
      serial +
      '" class="item pedalboard ' +
      shortname +
      '" title="' +
      name +
      '" data-width="' +
      width +
      '" data-height="' +
      height +
      '" data-scale="' +
      multiplier +
      '">\
    <div class="artwork" style="width:' +
      scaledWidth +
      "px;height:" +
      scaledHeight +
      "px; background-image:url(" +
      pedalboardImagePath +
      i +
      ')"></div>\
    <div class="actions">\
        <a class="rotate"></a>\
        <a class="delete"></a>\
    </div>\
</div>';

    $(".canvas").prepend(pedal);
    readyCanvas();
    ga("send", "event", "Pedalboard", "added", name);
    event.preventDefault();
  });

  // Activate color picker plugin on custom color field
  $(".custom-color-block").colorpicker({
    color: "#41C74D",
  });

  // Add custom pedal
  $("body").on("click", "#add-custom-pedal .btn", function (event) {
    var serial = GenRandom.Job();
    var multiplier = $("#canvas-scale").val();
    var width = convertUnitsIfNeeded('pd', $("#add-custom-pedal .custom-width").val());
    var height = convertUnitsIfNeeded('pd', $("#add-custom-pedal .custom-height").val());
    var scaledWidth = width * multiplier;
    var scaledHeight = height * multiplier;
    var dims = width + '" x ' + height + '"';
    var name = $("#add-custom-pedal .custom-name").val();
    var image = $("#add-custom-pedal .custom-color").val();
    var pedal =
      '\
<div id="item-' +
      serial +
      '" class="item pedal pedal--custom" style="width:' +
      scaledWidth +
      "px;height:" +
      scaledHeight +
      'px;" title="' +
      name +
      '" data-width="' +
      width +
      '" data-height="' +
      height +
      '" data-scale="' +
      multiplier +
      '">\
    <span class="pedal__box" style="background-color:' +
      image +
      ';"></span>\
    <span class="pedal__name">' +
      name +
      '</span>\
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

    $("#add-custom-pedal .invalid").removeClass("invalid");

    if (width == "" || height == "") {
      $("#add-custom-pedal .custom-height, #add-custom-pedal .custom-width").addClass(
        "invalid"
      );
      $("#add-custom-pedal .custom-width").focus();
    } else if (width == "") {
      $("#add-custom-pedal .custom-width").addClass("invalid").focus();
    } else if (height == "") {
      $("#add-custom-pedal .custom-height").addClass("invalid").focus();
    } else {
      console.log("add custom pedal...");
      $(".canvas").append(pedal);
      readyCanvas();
      // console.log(dims);
      ga("send", "event", "CustomPedal", "added", dims + " " + name);
      event.preventDefault();
    }
  });

  // Add custom pedalboard
  $("body").on("click", "#add-custom-pedalboard .btn", function (event) {
    var serial = GenRandom.Job();
    var multiplier = $("#canvas-scale").val();
    var width = convertUnitsIfNeeded('pb', $("#add-custom-pedalboard .custom-width").val());
    var height = convertUnitsIfNeeded('pb', $("#add-custom-pedalboard .custom-height").val());
    var scaledWidth = width * multiplier;
    var scaledHeight = height * multiplier;

    $("#add-custom-pedalboard .invalid").removeClass("invalid");

    if (width == "" || height == "") {
      $(
        "#add-custom-pedalboard .custom-height, #add-custom-pedalboard .custom-width"
      ).addClass("invalid");
      $("#add-custom-pedalboard .custom-width").focus();
    } else if (width == "") {
      $("#add-custom-pedalboard .custom-width").addClass("invalid").focus();
    } else if (height == "") {
      $("#add-custom-pedalboard .custom-height").addClass("invalid").focus();
    } else {
      console.log("add custom pedalboard...");
      var dims = width + '" x ' + height + '"';
      var pedalboard =
        '<div id="item-' +
        serial +
        '" class="item pedalboard pedalboard--custom" style="width:' +
        scaledWidth +
        "px;height:" +
        scaledHeight +
        "px; border-width:" +
        multiplier / 2 +
        'px" title="Custom Pedalboard" data-width="' +
        width +
        '" data-height="' +
        height +
        '" data-scale="' +
        multiplier +
        '">\
            <div class="actions">\
            <a class="delete"></a>\
            <a class="rotate"></a>\
            </div>\
            </div>';

      $(".canvas").prepend(pedalboard);
      readyCanvas();
      ga("send", "event", "CustomPedalboard", "added", dims + " " + name);
      event.preventDefault();
    }
  });

  // On keydown of "D" or "delete" remove pedal
  $("body").on("keydown keyup", function (event) {
    if (event.which == 68 || event.which == 8) {
      deleteSelected();
      $(".panel:not(.settings-popover)").remove();
      savePedalCanvas();
    }
  });

  // On keydown of "[", move pedal back
  $("body").on("keydown keyup", function (event) {
    if (event.which == 219) {
      $(".panel a[href='#back']").click();
      savePedalCanvas();
    }
  });

  // On keydown of "]", move pedal front
  $("body").on("keydown keyup", function (event) {
    if (event.which == 221) {
      $(".panel a[href='#front']").click();
      savePedalCanvas();
    }
  });

  // 37 - left
  // 38 - up
  // 39 - right
  // 40 - down

  // Move left
  $("body").on("keydown", function (event) {
    if (event.which == 37) {
      selectedItems().each(function () {
        $(this).css("left", parseInt($(this).css("left")) - 1);
      });
      savePedalCanvas();
    }
  });

  // Move up
  $("body").on("keydown", function (event) {
    if (event.which == 38) {
      selectedItems().each(function () {
        $(this).css("top", parseInt($(this).css("top")) - 1);
      });
      event.preventDefault();
      savePedalCanvas();
    }
  });

  // Move right
  $("body").on("keydown", function (event) {
    if (event.which == 39) {
      selectedItems().each(function () {
        $(this).css("left", parseInt($(this).css("left")) + 1);
      });
      savePedalCanvas();
    }
  });

  // Move down
  $("body").on("keydown", function (event) {
    if (event.which == 40) {
      selectedItems().each(function () {
        $(this).css("top", parseInt($(this).css("top")) + 1);
      });
      event.preventDefault();
      savePedalCanvas();
    }
  });

  $("body").on("keydown", function (event) {
    event.stopPropagation();

    //mvital: in some cases click event is sent multiple times to the handler - no idea why
    //mvital: seems calling stopImmediatePropagation() helps
    event.stopImmediatePropagation();

    if (event.which == 82) {
      rotateItems(selectedItems());
    }
  });

  // Clear the post-rectangle click suppression on any new press
  document.addEventListener(
    "pointerdown",
    function () {
      suppressNextClick = false;
    },
    true
  );

  // Rectangle selection: drag on empty canvas, or Shift+drag anywhere.
  // Capture phase so Shift+drag over an item doesn't start a Draggabilly drag.
  $(".canvas")[0].addEventListener(
    "pointerdown",
    function (e) {
      if (e.button != 0 || !(e.target == this || e.shiftKey)) return;
      e.stopPropagation();
      e.preventDefault();

      var additive = e.ctrlKey || e.metaKey;
      var start = canvasPoint(e);
      var rect = null;
      var $marquee = $('<div class="marquee"></div>').css({
        position: "absolute",
        border: "1px dashed #333",
        background: "rgba(0, 120, 215, 0.15)",
        pointerEvents: "none",
        zIndex: 1000,
      });

      function onMove(e) {
        var p = canvasPoint(e);
        if (!rect && Math.abs(p.x - start.x) < 3 && Math.abs(p.y - start.y) < 3) return;
        if (!rect) $(".canvas").append($marquee);
        rect = {
          left: Math.min(start.x, p.x),
          top: Math.min(start.y, p.y),
          right: Math.max(start.x, p.x),
          bottom: Math.max(start.y, p.y),
        };
        $marquee.css({
          left: rect.left,
          top: rect.top,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top,
        });
      }

      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        // No real drag: leave it to the normal click handlers
        if (!rect) return;
        $marquee.remove();
        if (!additive) $(".canvas .selected").removeClass("selected");
        $(".canvas .pedal, .canvas .pedalboard").each(function () {
          var r = itemRect(this);
          if (
            r.left < rect.right &&
            r.right > rect.left &&
            r.top < rect.bottom &&
            r.bottom > rect.top
          ) {
            $(this).addClass("selected");
          }
        });
        suppressNextClick = true;
        showPanel();
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    true
  );
}); // End Document ready

function convertUnitsIfNeeded(type, value) {
  // index.html has no unit switches, only the "Use mm for units" checkbox
  if (!$('#input-unit-' + type + '-wrapper').length) {
    return $('#convert-units').is(':checked') ? mmToIn(value) : value;
  }
  switch (type) {
    case 'pb':
      return ($('#input-unit-pb-wrapper span.on').text() === UNITS_IN) ? value : mmToIn(value);
    case 'pd':
      return ($('#input-unit-pd-wrapper span.on').text() === UNITS_IN) ? value : mmToIn(value);
    default:
      break;
  }
}

function mmToIn(value) {
  return Math.round((value * 0.0393701) * 100) / 100;
}

function inToMm(value) {
  return Math.round(value * 25.4);
}

// Update the custom pedal/pedalboard labels and placeholders in the sidebar
function convertUnits() {
  if ($('#convert-units').is(':checked')) {
    $("label .units").text('(mm)');
    $('#custom-pb-width').attr('placeholder', 610);
    $('#custom-pb-height').attr('placeholder', 318);
    $('#custom-p-width').attr('placeholder', 70);
    $('#custom-p-height').attr('placeholder', 108);
  } else {
    $("label .units").text('(inches)');
    $('#custom-pb-width').attr('placeholder', 24);
    $('#custom-pb-height').attr('placeholder', 12.5);
    $('#custom-p-width').attr('placeholder', 2.75);
    $('#custom-p-height').attr('placeholder', 4.25);
  }
  showPanel();
}

function readyCanvas(pedal) {
  var $draggable = $(".canvas .pedal, .canvas .pedalboard").draggabilly({
    containment: ".canvas",
  });

  $(".canvas .pedal, .canvas .pedalboard").draggabilly({
    containment: ".canvas",
  });

  $draggable.on("dragEnd", function (e) {
    console.log("dragEnd");
    ga("send", "event", "Canvas", "moved", "dragend");
    savePedalCanvas();
  });

  // Dragging a selected item moves the rest of the selection with it
  $draggable
    .off(".group")
    .on("dragStart.group", function () {
      groupDrag = null;
      if (!$(this).hasClass("selected")) return;
      groupDrag = selectedItems()
        .not(this)
        .map(function () {
          return {
            el: this,
            left: parseFloat($(this).css("left")) || 0,
            top: parseFloat($(this).css("top")) || 0,
          };
        })
        .get();
    })
    .on("dragMove.group", function () {
      if (!groupDrag) return;
      var draggie = $(this).data("draggabilly");
      var dx = draggie.position.x - draggie.startPosition.x;
      var dy = draggie.position.y - draggie.startPosition.y;
      groupDrag.forEach(function (f) {
        $(f.el).css({ left: f.left + dx, top: f.top + dy });
      });
    })
    .on("dragEnd.group", function () {
      if (!groupDrag) return;
      groupDrag = null;
      // The click that follows the drag would otherwise reduce the selection
      suppressNextClick = true;
      keepInCanvas(selectedItems());
      savePedalCanvas();
    });

  // $draggable.on( 'staticClick', function(event) {

  $draggable.on("staticClick", function (event) {
    //rotatePedal(this);
    var target = $(event.target);
    if (target.is(".delete")) {
      if ($(this).hasClass("selected")) {
        deleteSelected();
      } else {
        deletePedal(this);
      }
      deselect();
      $("body").click();
    } else if (target.is(".rotate")) {
      event.stopPropagation();

      //mvital: in some cases click event is sent multiple times to the handler - no idea why
      //mvital: seems calling stopImmediatePropagation() helps
      event.stopImmediatePropagation();

      //rotatePedal(this);
      if ($(this).hasClass("selected")) {
        rotateItems(selectedItems());
      } else {
        rotateItems($(this));
      }
    }
  });

  savePedalCanvas();
}

function savePedalCanvas() {
  console.log("Canvas Saved!");
  localStorage["pedalCanvas"] = JSON.stringify($(".canvas").html());
}

function exportPedalCanvas() {
  return new Blob(
    [JSON.stringify({
      source: "pedalplayground.com",
      version: "1.0",
      canvas: JSON.parse(localStorage["pedalCanvas"]),
    })],
    { type: "application/json" }
  );
}

function downloadPedalCanvas(filename) {
  const url = window.URL.createObjectURL(exportPedalCanvas());

  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}

function importPedalCanvas(file) {
  var reader = new FileReader();

  reader.addEventListener("load", () => {
    var blob = JSON.parse(reader.result);

    // TODO: check source and version

    $(".panel:not(.settings-popover)").remove();
    $(".canvas").html(blob.canvas);
    $("#canvas-scale").val($("#multiplier").val());
    $(".canvas").css("background-size", $("#multiplier").val() + "px");
    readyCanvas();
    savePedalCanvas();
  });

  reader.readAsText(file);
}

function uploadPedalCanvas() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = () => importPedalCanvas(input.files[0]);
  input.click();
}

function rotatePedal(pedal) {
  ga("send", "event", "Pedal", "clicked", "rotate");
  rotateItems($(pedal));
}

function deletePedal(pedal) {
  $(pedal).remove();
  deselect();
  savePedalCanvas();
}

function deselect() {
  $(".panel:not(.settings-popover)").remove();
  $(".canvas .selected").removeClass("selected");
  savePedalCanvas();
}

function deleteSelected() {
  $(".canvas .selected").remove();
  $(".panel:not(.settings-popover)").remove();
  savePedalCanvas();
}

// Set after a rectangle selection so the click that follows doesn't clear it
var suppressNextClick = false;

// Positions of the other selected items while a group is being dragged
var groupDrag = null;

function selectedItems() {
  return $(".canvas .selected");
}

function showPanel() {
  $(".panel:not(.settings-popover)").remove();
  var $items = selectedItems();
  var markup;
  if ($items.length == 1) {
    var id = $items.attr("id");
    var pedalName = $items.attr("title");
    var mm = $('#convert-units').is(':checked');
    var units = mm ? 'mm' : 'in';
    var width = mm ? inToMm($items.attr("data-width")) : $items.attr("data-width");
    var height = mm ? inToMm($items.attr("data-height")) : $items.attr("data-height");
    markup =
      '<div class="panel" data-id="#' +
      id +
      '">\
    <div class="panel__name">' +
      pedalName +
      '<br><span class="panel__dimensions">(' +
      width + units +
      " x " +
      height + units +
      ')</span>\
    </div>\
        <a href="#rotate" class="panel__action">Rotate <i>R</i></a>\
        <a href="#front" class="panel__action">Move Front <i>]</i></a>\
        <a href="#back" class="panel__action">Move Back <i>[</i></a>\
        <a href="#delete" class="panel__action">Delete <i>D</i></a>\
    </div>';
  } else if ($items.length > 1) {
    markup =
      '<div class="panel">\
    <div class="panel__name">' +
      $items.length +
      ' items selected</div>\
        <a href="#rotate" class="panel__action">Rotate <i>R</i></a>\
        <a href="#delete" class="panel__action">Delete <i>D</i></a>\
    </div>';
  } else {
    return;
  }
  $(".canvas").after(markup);
}

// Pointer position in canvas coordinates (same space as item left/top)
function canvasPoint(e) {
  var canvas = $(".canvas")[0];
  var c = canvas.getBoundingClientRect();
  return {
    x: e.clientX - c.left - canvas.clientLeft + canvas.scrollLeft,
    y: e.clientY - c.top - canvas.clientTop + canvas.scrollTop,
  };
}

// Visual bounds of an item in canvas coordinates, allowing for its rotation
// class (rotate-N classes rotate around the item's centre)
function itemRect(el) {
  var w = el.offsetWidth;
  var h = el.offsetHeight;
  var cx = (parseFloat($(el).css("left")) || 0) + w / 2;
  var cy = (parseFloat($(el).css("top")) || 0) + h / 2;
  if ($(el).is(".rotate-90, .rotate-270")) {
    var t = w;
    w = h;
    h = t;
  }
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

function unionRect($items) {
  var u = null;
  $items.each(function () {
    var r = itemRect(this);
    if (!u) {
      u = r;
    } else {
      u = {
        left: Math.min(u.left, r.left),
        top: Math.min(u.top, r.top),
        right: Math.max(u.right, r.right),
        bottom: Math.max(u.bottom, r.bottom),
      };
    }
  });
  return u;
}

// Shift the items together so that all of them are inside the canvas
function keepInCanvas($items) {
  if (!$items.length) return;
  var canvas = $(".canvas")[0];
  var u = unionRect($items);
  var dx = 0;
  var dy = 0;
  if (u.right > canvas.clientWidth) dx = canvas.clientWidth - u.right;
  if (u.left + dx < 0) dx = -u.left;
  if (u.bottom > canvas.clientHeight) dy = canvas.clientHeight - u.bottom;
  if (u.top + dy < 0) dy = -u.top;
  if (dx == 0 && dy == 0) return;
  $items.each(function () {
    $(this).css({
      left: (parseFloat($(this).css("left")) || 0) + dx,
      top: (parseFloat($(this).css("top")) || 0) + dy,
    });
  });
}

function cycleRotation(item) {
  if ($(item).hasClass("rotate-90")) {
    $(item).removeClass("rotate-90");
    $(item).addClass("rotate-180");
  } else if ($(item).hasClass("rotate-180")) {
    $(item).removeClass("rotate-180");
    $(item).addClass("rotate-270");
  } else if ($(item).hasClass("rotate-270")) {
    $(item).removeClass("rotate-270");
  } else {
    $(item).addClass("rotate-90");
  }
}

// Rotate the items 90 degrees clockwise as one group around the centre of
// their bounding box. A single item rotates in place.
function rotateItems($items) {
  if (!$items.length) return;
  var u = unionRect($items);
  var gx = (u.left + u.right) / 2;
  var gy = (u.top + u.bottom) / 2;
  $items.each(function () {
    var w = this.offsetWidth;
    var h = this.offsetHeight;
    var cx = (parseFloat($(this).css("left")) || 0) + w / 2;
    var cy = (parseFloat($(this).css("top")) || 0) + h / 2;
    $(this).css({
      left: gx - (cy - gy) - w / 2,
      top: gy + (cx - gx) - h / 2,
    });
    cycleRotation(this);
  });
  keepInCanvas($items);
  savePedalCanvas();
}

// function rotatePedal() {
//     alert("rotate Pedal");
//     if ( $(this).hasClass("rotate-90") ) {
//         $(this).removeClass("rotate-90");
//         $(this).addClass("rotate-180");
//     } else if ( $(this).hasClass("rotate-180") ) {
//         $(this).removeClass("rotate-180");
//         $(this).addClass("rotate-270");
//     }  else if ( $(this).hasClass("rotate-270") ) {
//         $(this).removeClass("rotate-270");
//     } else {
//         $(this).addClass("rotate-90");
//     }
//     return false;
// }

window.Pedal = function (type, brand, name, width, height, image) {
  this.Type = type || "";
  this.Brand = brand || "";
  this.Name = name || "";
  this.Width = width || "";
  this.Height = height || "";
  this.Image = image || "";
};

window.GetPedalData = function () {
  // console.log('GetPedalData');
  $.ajax({
    url: "public/data/pedals.json",
    dataType: "text",
    type: "GET",
    success: function (data) {
      data = $.parseJSON(data.replace(/\r\n/g, "").replace(/\t/g, ""));
      var pedals = [];
      for (var pedal in data) {
        pedals.push(
          new Pedal(
            data[pedal].Type || "",
            data[pedal].Brand || "",
            data[pedal].Name || "",
            data[pedal].Width || "",
            data[pedal].Height || "",
            data[pedal].Image || ""
          )
        );
      }
      //Sort brands and pedals alphabetically
      pedals.sort(function (a, b) {
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
    },
  });
};

window.RenderPedals = function (pedals) {
  var { Type, Brand, Name, Width, Height, Image } = pedals;
  var option = $("<option>", {
    text: `${Brand} ${Name}`,
    // id: `${Name.toLowerCase().replace(/(\s+)|(['"])/g, (m, p1, p2) => p1 ? "-" : "")}`,
    data: {
      width: Width,
      height: Height,
      image: Image,
    },
  });
  if ($("optgroup").is(`[label="${Brand}"]`)) {
    $(`optgroup[label="${Brand}"]`).append(option);
  } else {
    $("<optgroup>", {
      label: Brand,
      html: option,
    }).appendTo(".pedal-list");
  }
};

window.PedalBoard = function (brand, name, width, height, image) {
  this.Brand = brand || "";
  this.Name = name || "";
  this.Width = width || "";
  this.Height = height || "";
  this.Image = image || "";
};

window.GetPedalBoardData = function () {
  // console.log('GetPedalBoardData');
  $.ajax({
    url: "public/data/pedalboards.json",
    dataType: "text",
    type: "GET",
    success: function (data) {
      data = $.parseJSON(data.replace(/\r\n/g, "").replace(/\t/g, ""));
      var pedalboards = [];
      for (var pedalboard in data) {
        pedalboards.push(
          new PedalBoard(
            data[pedalboard].Brand || "",
            data[pedalboard].Name || "",
            data[pedalboard].Width || "",
            data[pedalboard].Height || "",
            data[pedalboard].Image || ""
          )
        );
      }
      console.log("Pedalboard data loaded");
      //Sort brands and pedals alphabetically
      pedalboards.sort(function (a, b) {
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
    },
  });
};

window.RenderPedalBoards = function (pedalboards) {
  // console.log('RenderPedalBoards');
  for (var i in pedalboards) {
    // var $pedalboard = $("<option>"+ pedalboards[i].Brand + " " + pedalboards[i].Name +"</option>").attr('id', pedalboards[i].Name.toLowerCase().replace(/\s+/g, "-").replace(/'/g, ''));
    var $pedalboard = $(
      "<option>" + pedalboards[i].Brand + " " + pedalboards[i].Name + "</option>"
    );
    $pedalboard.data("width", pedalboards[i].Width);
    $pedalboard.data("height", pedalboards[i].Height);
    $pedalboard.data("height", pedalboards[i].Height);
    $pedalboard.data("image", pedalboards[i].Image);
    $pedalboard.appendTo(".pedalboard-list");
  }
};

// List pedals on page to find errors
window.listPedals = function (pedals) {
  if ($("#list-pedals").length) {
    // console.log('List pedals...');
    for (var i in pedals) {
      multiplier = 40;
      Width = pedals[i].Width * multiplier;
      Height = pedals[i].Height * multiplier;

      var $pedalListing = $(
        '<div class="pedal-listing">\
                <img src="' +
        pedalImagePath +
        pedals[i].Image +
        '" alt="' +
        pedals[i].Brand +
        " " +
        pedals[i].Name +
        '" width="' +
        Width +
        '" height="' +
        Height +
        '"/>\
                <p class="pedal-brand">' +
        pedals[i].Brand +
        '</p>\
                <p class="pedal-name">' +
        pedals[i].Name +
        "</p>\
            </div>"
      );
      // $pedalListing.css('width', pedals[i].Width);
      // $pedalListing.css('height', pedals[i].Height);
      // $pedalListing.css('background-image', "url(" + pedals[i].Image + ")" );
      $pedalListing.appendTo("#list-pedals");
    }
  }
};

var GenRandom = {
  Stored: [],
  Job: function () {
    var newId = Date.now().toString().substr(3); // or use any method that you want to achieve this string
    if (!this.Check(newId)) {
      this.Stored.push(newId);
      return newId;
    }
    return this.Job();
  },
  Check: function (id) {
    for (var i = 0; i < this.Stored.length; i++) {
      if (this.Stored[i] == id) return true;
    }
    return false;
  },
};

$("body").on("click", ".item", function (e) {
  // Prevent bubble up to .canvas
  e.stopPropagation();

  // Click that ends a group drag, or a Shift+drag rectangle started on this item
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }

  // Rotate icon on a selected item already rotated the group; keep the selection
  if ($(e.target).is(".rotate") && $(this).hasClass("selected")) return;

  if (e.ctrlKey || e.metaKey) {
    $(this).toggleClass("selected");
  } else {
    $(".canvas .selected").removeClass("selected");
    $(this).addClass("selected");
  }
  showPanel();
});

$("body").on("click", 'a[href="#rotate"]', function (e) {
  e.stopPropagation();
  e.stopImmediatePropagation();

  rotateItems(selectedItems());
});

$("body").on("click", 'a[href="#delete"]', function () {
  deleteSelected();
});

$("body").on("click", 'a[href="#front"]', function (e) {
  e.stopImmediatePropagation();
  var id = $(this).parents(".panel").data("id");
  $(id).next().insertBefore(id);
  savePedalCanvas();
  e.stopPropagation();
});

$("body").on("click", 'a[href="#back"]', function (e) {
  e.stopImmediatePropagation();
  var id = $(this).parents(".panel").data("id");
  $(id).prev().insertAfter(id);
  savePedalCanvas();
  e.stopPropagation();
});

$("body").click(function () {
  // Click that ends a rectangle selection
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }

  // reset stuff
  $(".panel:not(.settings-popover)").remove();
  $(".canvas .selected").removeClass("selected");
});

$("body").on("click", ".canvas", function (e) {
  $(".settings-popover").addClass("hide");
  $(".settings-trigger").removeClass("open");
});

$("body").on("click", ".settings-trigger", function (e) {
  $(".settings-popover").removeClass("hide");
  $(".settings-trigger").addClass("open");
  e.preventDefault();
  e.stopPropagation();
});

$("body").on("click", ".settings-trigger.open", function (e) {
  $(".settings-popover").addClass("hide");
  $(".settings-trigger").removeClass("open");
  e.preventDefault();
});
