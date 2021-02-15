// RESOURCES USED TO MAKE THIS GULP FILE:
// http://www.revsys.com/blog/2014/oct/21/ultimate-front-end-development-setup/
// http://ericlbarnes.com/setting-gulp-bower-bootstrap-sass-fontawesome/
// https://markgoodyear.com/2014/01/getting-started-with-gulp/
// https://github.com/mikaelbr/gulp-notify/issues/81
// ------------------------------------------------------------------------------------

var gulp = require("gulp");
var sass = require("gulp-sass");
var watch = require("gulp-watch");
var plumber = require("gulp-plumber");
var minifycss = require("gulp-minify-css");
var rename = require("gulp-rename");
var gzip = require("gulp-gzip");
var livereload = require("gulp-livereload");
var notify = require("gulp-notify");
var gutil = require("gulp-util");
var concat = require("gulp-concat");
var imagemin = require("gulp-imagemin");
var responsive = require("gulp-responsive");
var cache = require("gulp-cached");
var minify = require("gulp-minify");

var gzip_options = {
	threshold: "1kb",
	gzipOptions: {
		level: 9,
	},
};

var reportError = function (error) {
	var lineNumber = error.lineNumber ? "LINE " + error.lineNumber + " -- " : "";

	notify({
		title: "Task Failed [" + error.plugin + "]",
		message: lineNumber + "See console.",
		sound: "Sosumi", // See: https://github.com/mikaelbr/node-notifier#all-notification-options-with-their-defaults
	}).write(error);

	gutil.beep(); // Beep 'sosumi' again

	// Inspect the error object
	// console.log(error);

	// Easy error reporting
	// console.log(error.toString());

	// Pretty error reporting
	var report = "";
	var chalk = gutil.colors.black.bgRed;

	report += chalk("TASK:") + " [" + error.plugin + "]\n";
	report += chalk("PROB:") + " " + error.message + "\n";
	if (error.lineNumber) {
		report += chalk("LINE:") + " " + error.lineNumber + "\n";
	}
	if (error.fileName) {
		report += chalk("FILE:") + " " + error.fileName + "\n";
	}
	console.error(report);

	// Prevent the 'watch' task from stopping
	this.emit("end");
};

// SCSS
gulp.task("styles", function () {
	return gulp
		.src("app/stylesheets/*.scss")
		.pipe(
			plumber({
				errorHandler: reportError,
			})
		)
		.pipe(sass())
		.pipe(gulp.dest("public/stylesheets"))
		.pipe(rename({ suffix: ".min" }))
		.pipe(minifycss())
		.pipe(gulp.dest("public/stylesheets"))
		.pipe(gzip(gzip_options))
		.pipe(gulp.dest("public/stylesheets"))
		.pipe(notify("SCSS Compiled!"))
		.on("error", reportError)
		.pipe(livereload());
});

// JS
gulp.task("scripts", function () {
	return gulp
		.src([
			"bower_components/jquery/dist/jquery.js",
			"bower_components/draggabilly/dist/draggabilly.pkgd.js",
			"bower_components/bootstrap-sass/assets/javascripts/bootstrap.js",
			"bower_components/bootstrap-colorpicker/dist/js/bootstrap-colorpicker.js",
			"bower_components/select2/dist/js/select2.js",
			"app/scripts/scripts.js",
		])
		.pipe(
			plumber({
				errorHandler: reportError,
			})
		)
		.pipe(concat("scripts.js"))
		.pipe(minify())
		.pipe(gulp.dest("public/scripts/"))
		.pipe(gzip(gzip_options))
		.pipe(gulp.dest("public/scripts/"))
		.pipe(notify("JS Compiled!"))
		.on("error", reportError)
		.pipe(livereload());
});

gulp.task("process-images", function () {
	return gulp
		.src("app/images/pedals/*")
		.pipe(cache("images"))
		.pipe(
			responsive({
				"*.*": {
					withoutEnlargement: false,
					errorOnUnusedConfig: false,
					width: "700",
					height: "700",
					max: true,
				},
			})
		)
		.pipe(imagemin())
		.pipe(gulp.dest("public/images/pedals/"));
});

/* Watch Files For Changes */
gulp.task("watch", function () {
	livereload.listen();
	gulp.watch("app/stylesheets/**", ["styles"]);
	gulp.watch("app/scripts/**", ["scripts"]);
	gulp.watch("*.php").on("change", livereload.changed);
	gulp.watch("includes/**").on("change", livereload.changed);
	gulp.watch("*.html").on("change", livereload.changed);
});

gulp.task("watch-all", function () {
	livereload.listen();
	//gulp.watch(['app/images/pedals/*.png','!app/images/pedals/*_tmp*.*'], ['images']);
	gulp.watch(
		["app/images/pedals-new/**/*.png", "!app/images/pedals-new/**/*_tmp*.*"],
		["process-images"]
	);
	gulp.watch("app/stylesheets/**", ["styles"]);
	gulp.watch("app/scripts/**", ["scripts"]);
	gulp.watch("*.php").on("change", livereload.changed);
	gulp.watch("includes/**").on("change", livereload.changed);
	gulp.watch("*.html").on("change", livereload.changed);
});

gulp.task("default", ["styles", "scripts", "watch"]);

gulp.task("all", ["styles", "scripts", "process-images", "watch-all"]);
