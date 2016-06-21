var m = require('mithril');
var $osf = require('js/osfHelpers');
var waterbutler = require('js/waterbutler');
var AddProject = require('js/addProjectPlugin');
var dropzonePreviewTemplate = require('js/home-page/dropzonePreviewTemplate');

require('css/dropzone-plugin.css');
require('css/quick-project-search-plugin.css');
require('loaders.css/loaders.min.css');

var Dropzone = require('dropzone');

var ZeroClipboard = require('zeroclipboard');
var fileURL = '';
var fileURLArray = [];
var clip = '';

// Don't show dropped content if user drags outside dropzone
window.ondragover = function (e) {
    e.preventDefault();
};
window.ondrop = function (e) {
    e.preventDefault();
};

var PublicFilesDropzone = {
    controller: function () {
        var dangerCount = 0;
        Dropzone.options.publicFilesDropzone = {
            // Dropzone is setup to upload multiple files in one request this configuration forces it to do upload file-by-
            //file, one request at a time.
            clickable: ['#publicFilesDropzone','#AddFile'],
            // number of files to process in parallel
            parallelUploads: 1,
            // prevents default uploading; call processQueue() to upload
            autoProcessQueue: false,
            withCredentials: true,
            method: 'put',
            // in MB; lower to test errors. Default is 256 MB.
            //maxFilesize: 1,
            maxFiles: 10,
            // checks if file is valid; if so, then adds to queue
            init: function () {
                // When user clicks close button on top right, reset the number of files
                var _this = this;
                $('button.close').on('click', function () {
                    _this.files.length = 0;
                });

            },
            accept: function (file, done) {
                if (this.files.length <= this.options.maxFiles) {
                    this.options.url = waterbutler.buildUploadUrl(false, 'osfstorage', window.contextVars.publicFilesId, file, {});
                    this.processFile(file);
                }
                else {
                    dangerCount = document.getElementsByClassName('alert-danger').length;
                    dangerCount === 0 ?
                        $osf.growl("Upload Failed", "You can upload a maximum of " + this.options.maxFiles + " files at once. " +
                            "<br> To upload more files, refresh the page or click X on the top right. " +
                            "<br> Want to share more files? Create a new project.", "danger", 5000) : '';

                    return this.emit("error", file);
                }
            },

            sending: function (file, xhr) {
                //Hack to remove webkitheaders
                var _send = xhr.send;
                xhr.send = function () {
                    _send.call(xhr, file);
                };
               // $('.drop-zone-format').css({'padding-bottom': '10px'});
                $('.panel-body').append(file.previewElement);
            },

            success: function (file, xhr) {
                buttonContainer = document.createElement('div');
                file.previewElement.appendChild(buttonContainer);
                var fileJson = JSON.parse((file.xhr.response));
                var link = waterbutler.buildDownloadUrl(fileJson.path, 'osfstorage', window.contextVars.publicFilesId, {});
                m.render(buttonContainer, dropzonePreviewTemplate.shareButton(link));
                this.processQueue();
                file.previewElement.classList.add('dz-success');
                file.previewElement.classList.add('dz-preview-background-success');
                file.previewElement.classList.remove('dz-processing');
                if (this.getQueuedFiles().length === 0 && this.getUploadingFiles().length === 0) {
                    if (this.files.length === 1)
                        $osf.growl("Upload Successful", this.files.length + " file was successfully uploaded to your public files project.", "success", 5000);
                    else
                        $osf.growl("Upload Successful", this.files.length + " files were successfully uploaded to your public files project.", "success", 5000);

                }
            },


            error: function (file, message) {
                this.files.length--;
                // Keeping the old behavior in case we want to revert it some time
                file.previewElement.classList.add("dz-error");
                file.previewElement.classList.add("dz-preview-background-error");
                file.previewElement.remove(); // Doesn't show the preview
                // Need the padding change twice because the padding doesn't resize when there is an error
                // get file size in MB, rounded to 1 decimal place
                var fileSizeMB = Math.round(file.size / (1000 * 1000) * 10) / 10;
                if (fileSizeMB > this.options.maxFilesize) {
                    $osf.growl("Upload Failed", file.name + " could not be uploaded. <br> The file is " + fileSizeMB + " MB," +
                        " which exceeds the max file size of " + this.options.maxFilesize + " MB", "danger", 5000);
                }
            },

        };

        var $publicFiles = $('#publicFilesDropzone');

        $publicFiles.on("click", "div.dz-share", function (e) {
            var infoCount = document.getElementsByClassName('alert-info').length;
            if (infoCount === 0) {
                $.growl({
                    icon: 'fa fa-clipboard',
                    message: ' Link copied to clipboard'
                }, {
                    type: 'info',
                    allow_dismiss: false,
                    mouse_over: 'pause',
                    placement: {
                        from: "top",
                        align: "center"
                    },
                    animate: {
                        enter: 'animated fadeInDown',
                        exit: 'animated fadeOut'
                    }
                });
            }
        });

        $publicFiles.dropzone({
            url: 'placeholder',
            previewTemplate: $osf.mithrilToStr(dropzonePreviewTemplate.dropzonePreviewTemplate())
        });

        $('#ShareButton').click(function () {
                $publicFiles.stop().slideToggle();
                $publicFiles.css('display', 'inline-block');
                $('#glyphchevron').toggleClass('glyphicon glyphicon-chevron-down glyphicon glyphicon-chevron-up');
            }
        );

    },

    view: function (ctrl, args) {
        function headerTemplate() {
            return [
                m('h2.col-xs-6', 'Dashboard'), m('m-b-lg.pull-right',
                    m('button.btn.btn-primary.m-t-md.f-w-xl #ShareButton',
                        ' Upload Public Files',m('span.glyphicon.glyphicon-chevron-down #glyphchevron')), m.component(AddProject, {
                            buttonTemplate: m('button.btn.btn-success.btn-success-high-contrast.m-t-md.f-w-xl.pull-right[data-toggle="modal"][data-target="#addProjectFromHome"]',
                                {
                                    onclick: function () {
                                        $osf.trackClick('quickSearch', 'add-project', 'open-add-project-modal');
                                    }
                                }, 'Create new project'),
                            modalID: 'addProjectFromHome',
                            stayCallback: function _stayCallback_inPanel() {
                                document.location.reload(true);
                            },
                            trackingCategory: 'quickSearch',
                            trackingAction: 'add-project',
                            templatesFetcher: ctrl.templateNodes
                        }
                    )
                )
            ];
        }

        function closeButton() {
            return [
                m('button.close.fa.fa-times.dz-font[aria-label="Close"].pull-right', {
                        onclick: function () {
                            $('#publicFilesDropzone').hide();
                            $('div.dz-preview').remove();
                            $('#glyphchevron').toggleClass('glyphicon glyphicon-chevron-up glyphicon glyphicon-chevron-down');
                            // $('.drop-zone-format').css({'padding-bottom': '175px'});
                        }
                    }
                )
            ]
        }

        function footerButtons() {
            return [
                m('button.pull-right.btn.btn-primary.f-w-xl', {
                        onclick: function () {
                            $('#publicFilesDropzone').hide();
                            $('div.dz-preview').remove();
                            $('#glyphchevron').toggleClass('glyphicon glyphicon-chevron-up glyphicon glyphicon-chevron-down');
                            // $('.drop-zone-format').css({'padding-bottom': '175px'});
                        }
                    },'Done'
                ),
                 m('button.pull-left.btn btn-success.btn-success-high-contrast.f-w-xl.dz-clickable #AddFile', {
                        onclick: function () {
                            //$('#publicFilesDropzone').hide();
                            //$('div.dz-preview').remove();
                            //$('#glyphchevron').toggleClass('glyphicon glyphicon-chevron-up glyphicon glyphicon-chevron-down');
                            // $('.drop-zone-format').css({'padding-bottom': '175px'});
                        }
                    },'Add a file'
                ),
            ]
        }



        function publicFilesHelpButton() {
            return [
                m('button.btn.fa.fa-info.close.dz-font[aria-label="Drag-and-Drop Help"][data-toggle="modal"][data-target="#dropZoneHelpModal"]'),
                m('.modal.fade.dz-cursor-default #dropZoneHelpModal',
                    m('.modal-dialog',
                        m('.modal-content',
                            m('.modal-header',
                                m('button.close[data-dismiss="modal"]', '—'),
                                m('h4.modal-title', 'Public Files Drag-and-Drop Help')),
                            m('.modal-body', m('p', 'Files uploaded here will be automatically added to your public files. Additionally: '),
                                m('ul',
                                    m('li', 'You may upload one file at a time.'),
                                    m('li', 'File uploads may be up to 256 MB.'),
                                    m('li', 'To upload more files click add a file'),
                                    m('li', 'To show and hide your uploads, toggle the ', m('strong', 'Upload Public Files'), ' button.'),
                                    m('li', 'Click ', m('span.i.fa.fa-copy'), ' to copy a download link for that file to your clipboard. Share this link with others!'))
                            ),
                            m('.modal-footer', m('button.btn.btn-default[data-dismiss="modal"]', 'Close'))
                        )
                    )
                )
            ]
        }

        function publicFilesHeader() {
            return [
                m('h1.dz-p.text-center.f-w-xl ', 'Drop files or click add a file',
                    m('h5', 'Files are uploaded to your ',
                        m('a', {
                            href: '/public_files/', onclick: function (e) {
                                // Prevent clicking of link from opening file uploader
                                e.stopImmediatePropagation();
                            }
                        }, 'Public Files'), ' ', m('i.fa.fa-question-circle.text-muted', {
                            'data-toggle': 'tooltip',
                            'title': 'The Public Files Project allows you to easily collaborate and share your files with anybody.',
                            'data-placement': 'bottom'
                        }, '')
                    )
                )
            ]
        }


        // Activate Public Files tooltip info
        $('[data-toggle="tooltip"]').tooltip();
        return m('.row',
            m('.col-xs-12.m-b-sm', headerTemplate()
            ),
            m('div.p-v-xs.drop-zone-format.drop-zone-invis .pointer .panel #publicFilesDropzone',
                m('.panel-heading', closeButton(),
                    publicFilesHelpButton(), publicFilesHeader()
                ),
                m('.panel-body.dz-body-height', ''),
                m('.panel-footer.clearfix', footerButtons())
            )
        );
    }
};


module.exports = PublicFilesDropzone;