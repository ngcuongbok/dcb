
  (function () {
    var API = 'https://script.google.com/macros/s/AKfycbw4V5uwc4dNMR3f4JcsVuwpoOm5N8JhxjNQBXjTdWqEAezqr53B-6RkQY0C1O85Zssa/exec';
    var allF = [], imgF = [];
    var ptbFancyboxCallbacks = [];
    var ptbFancyboxLoading = false;

    function ptbLoadCssOnce(id, href) {
      if (document.getElementById(id)) return;
      var link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    function ptbLoadScriptOnce(id, src, done) {
      var existing = document.getElementById(id);
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') done();
        else existing.addEventListener('load', done, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.onload = function () {
        script.setAttribute('data-loaded', '1');
        done();
      };
      document.head.appendChild(script);
    }

    function ptbEnsureFancybox(callback) {
      if (window.jQuery && window.jQuery.fancybox) {
        callback();
        return;
      }
      ptbFancyboxCallbacks.push(callback);
      if (ptbFancyboxLoading) return;
      ptbFancyboxLoading = true;
      ptbLoadCssOnce('ptb-fancybox-css', 'https://cdnjs.cloudflare.com/ajax/libs/fancybox/3.5.7/jquery.fancybox.min.css');
      function flush() {
        ptbFancyboxLoading = false;
        var callbacks = ptbFancyboxCallbacks.splice(0);
        callbacks.forEach(function (cb) { cb(); });
      }
      function loadFancyboxScript() {
        ptbLoadScriptOnce('ptb-fancybox-js', 'https://cdnjs.cloudflare.com/ajax/libs/fancybox/3.5.7/jquery.fancybox.min.js', flush);
      }
      if (window.jQuery) loadFancyboxScript();
      else ptbLoadScriptOnce('ptb-jquery-js', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js', loadFancyboxScript);
    }

    function gFid() {
      var p = new URLSearchParams(window.location.search), r = p.get('id') || '';
      if (!r) return '';
      r = decodeURIComponent(r);
      var m = r.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
      return r.split('?')[0].split('&')[0].split('#')[0].trim();
    }

    function gMode() {
      var p = new URLSearchParams(window.location.search);
      var mode = (p.get('mode') || '').trim().toLowerCase();
      if (mode === 'sb' || mode === 'selfbooth') return 'sb';
      if (mode === 'addon' || mode === 'extras' || mode === 'add-on' || mode === 'in-them') return 'addon';
      if (mode === 'ptb' || mode === 'photobooth') return 'ptb';
      return 'ptb';
    }

    function viewerApiUrl(actionName, requestMode, requestId) {
      return API + '?action=' + encodeURIComponent(actionName) + '&mode=' + encodeURIComponent(requestMode) + '&id=' + encodeURIComponent(requestId);
    }

    function loadViewerJson(actionName, requestMode, requestId) {
      var url = viewerApiUrl(actionName, requestMode, requestId);
      return fetch(url, { redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) {
          try { return JSON.parse(t); }
          catch (e) { throw new Error(t.substring(0, 100)); }
        })
        .catch(function () {
          return new Promise(function (resolve, reject) {
            var cb = 'ptbCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            window[cb] = function (d) { delete window[cb]; resolve(d || {}); };
            var s = document.createElement('script');
            s.src = url + '&callback=' + cb;
            s.onerror = function () { delete window[cb]; reject(new Error('Không thể kết nối server.')); };
            document.body.appendChild(s);
          });
        });
    }

    function showLazyLoadError(message) {
      var content = $('ptbContent');
      if (!content || content.style.display === 'none') {
        showE('Lỗi kết nối', message || 'Không thể tải danh sách ảnh.');
        return;
      }
      var box = document.createElement('div');
      box.style.cssText = 'background:#FFF3F0;border:1px solid #E8B8AF;border-radius:14px;padding:12px 14px;margin:12px 0;color:#9A3E33;font-size:.82rem;font-weight:900';
      box.textContent = message || 'Không thể tải danh sách ảnh. Bấm tải lại trang để thử lại.';
      content.insertBefore(box, content.firstChild);
    }

    // Preview preparation is optional and never blocks the customer flow.
    function warmSharingPreview(res) {
      if (!res || res.error || res.lazyFiles || res.loadingFiles) return;
      var current = new URL(window.location.href);
      var id = current.searchParams.get('id') || '';
      if (!/^[A-Za-z0-9_-]{6,160}$/.test(id)) return;
      var url = new URL('/viewer-preview-warm', current.origin);
      url.searchParams.set('id', id);
      var requestedMode = current.searchParams.get('mode');
      if (requestedMode) url.searchParams.set('mode', requestedMode);
      fetch(url.toString(), {method:'POST', keepalive:true}).catch(function () {});
    }

    function applyViewerFilesData(res) {
      if (!res || res.error) {
        if (sbImagesLoading) {
          sbImagesLoading = false;
          sbRefreshGalleryHtml();
        }
        if (sbSubmittedLoading) {
          sbSubmittedLoading = false;
          sbSubmittedLoadError = true;
          sbRenderSubmittedCards();
        }
        showLazyLoadError((res && res.error) || 'Không thể tải danh sách ảnh.');
        return;
      }
      warmSharingPreview(res);
      if (mode === 'addon' || res.mode === 'addon') {
        res.mode = 'addon';
        onAddon(res);
        return;
      }
      if (res.mode === 'sb') {
        applySbFilesData(res);
      } else {
        onD(res);
      }
    }

    function loadViewerFilesAfterShell(shellRes) {
      if (!shellRes || shellRes.error || !shellRes.lazyFiles) return;
      var resolvedMode = shellRes.mode || mode;
      var resolvedId = shellRes.session_folder_id || shellRes.sessionFolderId || shellRes.root_folder_id || shellRes.rootFolderId || shellRes.folder_id || shellRes.folderId || fid;
      loadViewerJson('getFiles', resolvedMode, resolvedId)
        .then(applyViewerFilesData)
        .catch(function (err) {
          if (sbImagesLoading) {
            sbImagesLoading = false;
            sbRefreshGalleryHtml();
          }
          if (sbSubmittedLoading) {
            sbSubmittedLoading = false;
            sbSubmittedLoadError = true;
            sbRenderSubmittedCards();
          }
          showLazyLoadError(err.message || 'Không thể tải danh sách ảnh.');
        });
    }

    var fid = gFid();
    var mode = gMode();
    if (!fid) { showE('Thiếu ID', 'Thêm <b>?id=FOLDER_ID</b> vào URL.'); return; }

    loadViewerJson('resolveViewer', mode, fid)
      .then(function (res) {
        onViewerData(res);
        loadViewerFilesAfterShell(res);
      })
      .catch(function (err) { showE('Lỗi kết nối', err.message || 'Không thể kết nối server.'); });

    var sbImages = [], sbSlots = [], sbActive = 0, sbPage = 0, sbTab = 'gallery';
    var sbImagesLoading = false;
    var sbPickerSlot = -1;
    var sbDownloadFolderId = fid;
    var sbSessionFolderId = fid;
    var sbDownloadDriveUrl = 'https://drive.google.com/drive/folders/' + encodeURIComponent(fid);
    var sbSubmitProgressTimer = null;
    var sbCurrentUploadTimer = null;
    var sbCurrentUploadProgress = 0;
    var sbParallelUploadTimers = {};
    var sbSubmitProgressLayoutKey = '';
    var sbSubmitProgressLastScrollAt = 0;
    var sbComfortIndex = 0;
    var sbConsentTimer = null;
    var sbCountdownTimer = null;
    var sbCardPreviewCards = [];
    var sbCardPreviewSignature = '';
    var sbCardPreviewBuildPromise = null;
    var sbCardPreviewObjectUrls = [];
    var sbPtcardCards = [];
    var sbPtcardActive = 0;
    var sbPtcardActiveSide = 'front';
    var sbPtcardActiveSlot = 0;
    var sbPtcardUploadSide = 'front';
    var sbPtcardUploadSlot = 0;
    var sbPtcardUploadTarget = -1;
    var sbPtcardPreviewCards = [];
    var sbPtcardPreviewSignature = '';
    var sbPtcardObjectUrls = [];
    var sbCdCards = [];
    var sbCdActive = 0;
    var sbCdUploadTarget = -1;
    var sbCdPreviewCards = [];
    var sbCdPreviewSignature = '';
    var sbUploadFileCache = {};
    var sbSubmitJobId = '';
    var sbSubmitJobSignature = '';
    var sbAutoPreviewTimer = null;
    var sbSmartPackTimer = null;
    var sbPresetScrollLeft = 0;
    var sbPtcardPresetScrollLeft = 0;
    var sbCdPresetScrollLeft = 0;
    var sbEditExpiresAt = 0;
    var sbCaptureStartedAt = 0;
    var sbEditWindowFromData = false;
    var sbLargestVisualViewportBottom = 0;
    var sbViewportHasExpanded = false;
    var SB_DEFAULT_SLOTS_PER_PAGE = 6;
    var SB_EDIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    var SB_EDIT_COUNTDOWN_WINDOW_MS = 6 * 60 * 60 * 1000;
    var SB_CARD_JPEG_QUALITY = 1;
    var SB_CARD_RENDER_VERSION = 2;
    var SB_SMART_PACK_TOLERANCE_PX = 20;
    var sbPrintCount = 1;
    var sbKeyCode = '';
    var sbCustomerName = '';
    var sbCustomerPhone = '';
    var sbPackageExtras = { photocards: 0, cds: 0 };
    var sbExtraUploads = { photocards: [], cds: [] };
    var sbExtraUploadTarget = '';
    var sbSubmittedCards = [];
    var sbSubmittedLoading = false;
    var sbSubmittedLoadError = false;
    var sbSubmittedActiveJobId = '';
    var sbSubmittedActivePage = null;
    var sbSubmittedGeneratedSmall = {};
    function sbNormalizeButtons(root) {
      var scope = root || $('ptbContent') || document;
      if (!scope || !scope.querySelectorAll) return;
      scope.querySelectorAll('button:not([type])').forEach(function (btn) {
        btn.type = 'button';
      });
    }
    function sbTrackPreviewObjectUrl(url) {
      if (url && String(url).indexOf('blob:') === 0) sbCardPreviewObjectUrls.push(url);
      return url;
    }
    function sbClearCardPreviewObjectUrls() {
      sbCardPreviewObjectUrls.forEach(function (url) {
        try { URL.revokeObjectURL(url); } catch (err) {}
      });
      sbCardPreviewObjectUrls = [];
    }
    function sbTrackPtcardObjectUrl(url) {
      if (url && String(url).indexOf('blob:') === 0) sbPtcardObjectUrls.push(url);
      return url;
    }
    function sbClearPtcardObjectUrls() {
      sbPtcardObjectUrls.forEach(function (url) {
        try { URL.revokeObjectURL(url); } catch (err) {}
      });
      sbPtcardObjectUrls = [];
    }
    function sbCanvasToObjectUrl(canvas, mimeType, quality) {
      if (!canvas) return Promise.resolve('');
      if (canvas.toBlob) {
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) {
            if (!blob) {
              resolve(canvas.toDataURL(mimeType || 'image/jpeg', quality));
              return;
            }
            resolve(sbTrackPreviewObjectUrl(URL.createObjectURL(blob)));
          }, mimeType || 'image/jpeg', typeof quality === 'number' ? quality : .78);
        });
      }
      return Promise.resolve(canvas.toDataURL(mimeType || 'image/jpeg', quality));
    }
    function sbUploadCacheKey(file) {
      return [
        file && file.name || 'upload',
        file && file.size || 0,
        file && file.lastModified || 0,
        file && file.type || ''
      ].join('|');
    }
    function sbStringHash(value) {
      var hash = 2166136261;
      value = String(value || '');
      for (var i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return ('0000000' + (hash >>> 0).toString(36)).slice(-8);
    }
    function sbSlotUploadRef(slot, idx) {
      if (!slot) return 'slot-upload-' + idx;
      if (slot.uploadRef) return String(slot.uploadRef);
      return 'slot-upload-' + sbStringHash([
        slot.name || '',
        slot.size || 0,
        slot.type || '',
        slot.src || '',
        slot.dataUrl ? sbStringHash(slot.dataUrl) : ''
      ].join('|'));
    }
    function sbUpdateMobileViewportInset() {
      var inset = 0;
      var vv = window.visualViewport;
      if (vv) {
        var viewportBottom = Math.max(0, Number(vv.height || 0) + Number(vv.offsetTop || 0));
        var previousLargest = sbLargestVisualViewportBottom;
        if (!sbLargestVisualViewportBottom || viewportBottom > sbLargestVisualViewportBottom) {
          if (previousLargest && viewportBottom > previousLargest + 12) sbViewportHasExpanded = true;
          sbLargestVisualViewportBottom = viewportBottom;
        }
        var layoutHeight = Math.max(
          Number(window.innerHeight || 0),
          Number(document.documentElement && document.documentElement.clientHeight || 0),
          Number(sbLargestVisualViewportBottom || 0)
        );
        var measuredInset = Math.max(0, layoutHeight - Number(vv.height || 0) - Number(vv.offsetTop || 0));
        var dynamicInset = Math.max(0, Number(sbLargestVisualViewportBottom || 0) - viewportBottom);
        inset = Math.max(measuredInset, dynamicInset);
      }
      var ua = navigator.userAgent || '';
      var isIos = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
      var standalone = Boolean(window.navigator.standalone) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      if (isIos && isSafari && !standalone && Math.min(window.innerWidth || 0, window.innerHeight || 0) < 900) {
        var safariBarFallback = Math.min(128, Math.max(92, Math.round(Number(window.innerHeight || 780) * 0.13)));
        if (!vv || (!sbViewportHasExpanded && inset < 8)) inset = Math.max(inset, safariBarFallback);
      }
      var isMobileViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0) < 900;
      var editPanel = $('sbEditPanel');
      var editPanelVisible = Boolean(editPanel && editPanel.style.display !== 'none' && editPanel.offsetParent !== null);
      if (isMobileViewport && editPanelVisible && inset < 56) {
        var browserBarFallback = Math.min(118, Math.max(64, Math.round(Number(window.innerHeight || 780) * 0.09)));
        inset = Math.max(inset, browserBarFallback);
      }
      inset = Math.round(inset);
      document.documentElement.style.setProperty('--sb-mobile-bottom', inset + 'px');
      var app = $('ptb-app');
      if (app) app.style.setProperty('--sb-mobile-bottom', inset + 'px');
    }
    sbUpdateMobileViewportInset();
    window.addEventListener('resize', sbUpdateMobileViewportInset);
    window.addEventListener('resize', sbScheduleSmartCardPacking);
    window.addEventListener('orientationchange', function () {
      sbLargestVisualViewportBottom = 0;
      sbViewportHasExpanded = false;
      window.setTimeout(sbUpdateMobileViewportInset, 250);
      window.setTimeout(sbScheduleSmartCardPacking, 260);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', sbUpdateMobileViewportInset);
      window.visualViewport.addEventListener('resize', sbScheduleSmartCardPacking);
      window.visualViewport.addEventListener('scroll', sbUpdateMobileViewportInset);
    }
    document.addEventListener('click', function (event) {
      var closest = event.target && event.target.closest;
      var btn = closest ? event.target.closest('#sbEditor button, #sbConsentModal button, #sbSlotNoticeModal button, .sb-help-modal button') : null;
      if (btn) event.preventDefault();
    }, true);
    var SB_FRAME_PRESETS = [
      {
            "id": "sb-ms9upnw5",
            "label": "VOGUE",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 50,
                        "y": 298,
                        "w": 538,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 640,
                        "y": 298,
                        "w": 549,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1400,
                        "y": 436,
                        "w": 806,
                        "h": 538,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 50,
                        "y": 661,
                        "w": 538,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 640,
                        "y": 661,
                        "w": 549,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 50,
                        "y": 1025,
                        "w": 538,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 640,
                        "y": 1025,
                        "w": 549,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1261,
                        "y": 1025,
                        "w": 1084,
                        "h": 722,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 50,
                        "y": 1388,
                        "w": 538,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 640,
                        "y": 1388,
                        "w": 549,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1288,
                        "y": 1895,
                        "w": 803,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 66,
                        "y": 1919,
                        "w": 635,
                        "h": 551,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1284,
                        "y": 2610,
                        "w": 542,
                        "h": 669,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 1885,
                        "y": 2610,
                        "w": 542,
                        "h": 669,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 366,
                        "y": 2732,
                        "w": 326,
                        "h": 401,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 771,
                        "y": 2732,
                        "w": 326,
                        "h": 400,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  }
            ],
            "cardRegions": [
                  {
                        "x": 10,
                        "y": 30,
                        "w": 610,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 620,
                        "y": 30,
                        "w": 590,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1220,
                        "y": 30,
                        "w": 1180,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 1845,
                        "w": 1224,
                        "h": 698,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1238,
                        "y": 1845,
                        "w": 1221,
                        "h": 698,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1250,
                        "y": 2580,
                        "w": 600,
                        "h": 900,
                        "rotate": 0.0,
                        "label": "Card 6"
                  },
                  {
                        "x": 1860,
                        "y": 2580,
                        "w": 608,
                        "h": 902,
                        "rotate": 0.0,
                        "label": "Card 7"
                  },
                  {
                        "x": 312,
                        "y": 2578,
                        "w": 418,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 730,
                        "y": 2580,
                        "w": 410,
                        "h": 580,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1hbJ6Q-Ecj8gOBwH7pAu9fyWuyJ16QPb-=s0",
            "overlayFileId": "1hbJ6Q-Ecj8gOBwH7pAu9fyWuyJ16QPb-",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9urnxl",
            "label": "RED",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 68,
                        "y": 197,
                        "w": 499,
                        "h": 651,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 665,
                        "y": 202,
                        "w": 489,
                        "h": 641,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1243,
                        "y": 214,
                        "w": 523,
                        "h": 665,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1817,
                        "y": 214,
                        "w": 523,
                        "h": 665,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 68,
                        "y": 921,
                        "w": 499,
                        "h": 651,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 665,
                        "y": 926,
                        "w": 489,
                        "h": 641,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1243,
                        "y": 952,
                        "w": 523,
                        "h": 665,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1817,
                        "y": 952,
                        "w": 523,
                        "h": 665,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 2016,
                        "y": 2107,
                        "w": 322,
                        "h": 416,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 100,
                        "y": 2136,
                        "w": 811,
                        "h": 1128,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1082,
                        "y": 2141,
                        "w": 801,
                        "h": 1118,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2018,
                        "y": 2698,
                        "w": 318,
                        "h": 412,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  }
            ],
            "cardRegions": [
                  {
                        "x": 1200,
                        "y": 20,
                        "w": 1193,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 21,
                        "y": 28,
                        "w": 589,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 610,
                        "y": 30,
                        "w": 590,
                        "h": 1780,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 20,
                        "y": 1980,
                        "w": 960,
                        "h": 1501,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 980,
                        "y": 1980,
                        "w": 980,
                        "h": 1500,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1964,
                        "y": 1975,
                        "w": 421,
                        "h": 585,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1960,
                        "y": 2550,
                        "w": 430,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/10ri3hO9zpifPRlXZ0O5LfoxKvoS9tgUQ=s0",
            "overlayFileId": "10ri3hO9zpifPRlXZ0O5LfoxKvoS9tgUQ",
            "overlayOnly": true
      },
      {
            "id": "sb-msfygby9",
            "label": "Disney",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 67,
                        "y": 391,
                        "w": 503,
                        "h": 342,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 694,
                        "y": 391,
                        "w": 503,
                        "h": 342,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1331,
                        "y": 522,
                        "w": 521,
                        "h": 446,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1883,
                        "y": 522,
                        "w": 521,
                        "h": 446,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 67,
                        "y": 771,
                        "w": 503,
                        "h": 342,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 694,
                        "y": 771,
                        "w": 503,
                        "h": 342,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1331,
                        "y": 1004,
                        "w": 521,
                        "h": 446,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1883,
                        "y": 1004,
                        "w": 521,
                        "h": 446,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 67,
                        "y": 1151,
                        "w": 503,
                        "h": 342,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 694,
                        "y": 1151,
                        "w": 503,
                        "h": 342,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1051,
                        "y": 1961,
                        "w": 496,
                        "h": 426,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 515,
                        "y": 1962,
                        "w": 496,
                        "h": 426,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 55,
                        "y": 2584,
                        "w": 688,
                        "h": 425,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 1570,
                        "y": 2593,
                        "w": 320,
                        "h": 390,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1976,
                        "y": 2593,
                        "w": 321,
                        "h": 390,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 55,
                        "y": 3019,
                        "w": 688,
                        "h": 425,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  },
                  {
                        "x": 754,
                        "y": 3019,
                        "w": 687,
                        "h": 425,
                        "rotate": 0.0,
                        "label": "Slot 17",
                        "layer_index": 17
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 614,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 638,
                        "y": 28,
                        "w": 624,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1270,
                        "y": 28,
                        "w": 1189,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2550,
                        "w": 1462,
                        "h": 940,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 18,
                        "y": 1873,
                        "w": 1779,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1520,
                        "y": 2550,
                        "w": 420,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1930,
                        "y": 2550,
                        "w": 420,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/13WUyiCP93pb_3hu6EtyCAAGJOBmRBdt3=s0",
            "overlayFileId": "13WUyiCP93pb_3hu6EtyCAAGJOBmRBdt3",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9usqn3",
            "label": "Capture Ring",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 1284,
                        "y": 305,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1812,
                        "y": 305,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 662,
                        "y": 311,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 73,
                        "y": 312,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 1284,
                        "y": 667,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1812,
                        "y": 667,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 662,
                        "y": 670,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 73,
                        "y": 671,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 73,
                        "y": 1029,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 662,
                        "y": 1030,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1284,
                        "y": 1030,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 1812,
                        "y": 1030,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 73,
                        "y": 1388,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 662,
                        "y": 1389,
                        "w": 488,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1284,
                        "y": 1392,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 1812,
                        "y": 1392,
                        "w": 492,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  },
                  {
                        "x": 1395,
                        "y": 2104,
                        "w": 913,
                        "h": 605,
                        "rotate": 0.0,
                        "label": "Slot 17",
                        "layer_index": 17
                  },
                  {
                        "x": 153,
                        "y": 2139,
                        "w": 872,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 18",
                        "layer_index": 18
                  },
                  {
                        "x": 153,
                        "y": 2788,
                        "w": 872,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 19",
                        "layer_index": 19
                  },
                  {
                        "x": 1397,
                        "y": 2994,
                        "w": 292,
                        "h": 364,
                        "rotate": 0.0,
                        "label": "Slot 20",
                        "layer_index": 20
                  },
                  {
                        "x": 1908,
                        "y": 2994,
                        "w": 292,
                        "h": 364,
                        "rotate": 0.0,
                        "label": "Slot 21",
                        "layer_index": 21
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 614,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1189,
                        "y": 28,
                        "w": 1193,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 630,
                        "y": 30,
                        "w": 551,
                        "h": 1780,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 1929,
                        "w": 1196,
                        "h": 1551,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1249,
                        "y": 1929,
                        "w": 1210,
                        "h": 870,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1316,
                        "y": 2827,
                        "w": 434,
                        "h": 624,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1840,
                        "y": 2830,
                        "w": 420,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1Q0b8kJcBKt8tAz30o8guF8hrbTLcyq62=s0",
            "overlayFileId": "1Q0b8kJcBKt8tAz30o8guF8hrbTLcyq62",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9utuoq",
            "label": "Cham bi den trang",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 178,
                        "y": 151,
                        "w": 284,
                        "h": 380,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 801,
                        "y": 151,
                        "w": 284,
                        "h": 380,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1338,
                        "y": 204,
                        "w": 501,
                        "h": 669,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1896,
                        "y": 204,
                        "w": 501,
                        "h": 669,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 178,
                        "y": 537,
                        "w": 284,
                        "h": 380,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 801,
                        "y": 537,
                        "w": 284,
                        "h": 380,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 178,
                        "y": 922,
                        "w": 284,
                        "h": 379,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 801,
                        "y": 922,
                        "w": 284,
                        "h": 379,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 1338,
                        "y": 960,
                        "w": 501,
                        "h": 670,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 1896,
                        "y": 960,
                        "w": 501,
                        "h": 670,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 178,
                        "y": 1305,
                        "w": 284,
                        "h": 378,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 801,
                        "y": 1305,
                        "w": 284,
                        "h": 378,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 82,
                        "y": 1956,
                        "w": 329,
                        "h": 449,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 588,
                        "y": 1956,
                        "w": 329,
                        "h": 449,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1094,
                        "y": 1956,
                        "w": 329,
                        "h": 449,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 1664,
                        "y": 1982,
                        "w": 275,
                        "h": 395,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  },
                  {
                        "x": 2097,
                        "y": 1982,
                        "w": 275,
                        "h": 394,
                        "rotate": 0.0,
                        "label": "Slot 17",
                        "layer_index": 17
                  },
                  {
                        "x": 1701,
                        "y": 2611,
                        "w": 653,
                        "h": 801,
                        "rotate": 0.0,
                        "label": "Slot 18",
                        "layer_index": 18
                  },
                  {
                        "x": 174,
                        "y": 2645,
                        "w": 579,
                        "h": 714,
                        "rotate": 0.0,
                        "label": "Slot 19",
                        "layer_index": 19
                  },
                  {
                        "x": 818,
                        "y": 2645,
                        "w": 579,
                        "h": 714,
                        "rotate": 0.0,
                        "label": "Slot 20",
                        "layer_index": 20
                  }
            ],
            "cardRegions": [
                  {
                        "x": 10,
                        "y": 20,
                        "w": 620,
                        "h": 1790,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 630,
                        "y": 20,
                        "w": 620,
                        "h": 1790,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1260,
                        "y": 20,
                        "w": 1210,
                        "h": 1790,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 10,
                        "y": 2540,
                        "w": 1510,
                        "h": 940,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1590,
                        "y": 2540,
                        "w": 880,
                        "h": 950,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 10,
                        "y": 1880,
                        "w": 1500,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Card 6"
                  },
                  {
                        "x": 1600,
                        "y": 1880,
                        "w": 411,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2020,
                        "y": 1880,
                        "w": 430,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1UQavng9V42VtM6WQ8Jg9IeerJaetF3bD=s0",
            "overlayFileId": "1UQavng9V42VtM6WQ8Jg9IeerJaetF3bD",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9uugg5",
            "label": "Film",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 94,
                        "y": 81,
                        "w": 452,
                        "h": 495,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 717,
                        "y": 81,
                        "w": 452,
                        "h": 495,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1334,
                        "y": 107,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1693,
                        "y": 107,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 2050,
                        "y": 107,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1334,
                        "y": 587,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1693,
                        "y": 587,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2050,
                        "y": 587,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 94,
                        "y": 613,
                        "w": 452,
                        "h": 495,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 717,
                        "y": 613,
                        "w": 452,
                        "h": 495,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1334,
                        "y": 1069,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 1693,
                        "y": 1069,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 2050,
                        "y": 1069,
                        "w": 351,
                        "h": 471,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 94,
                        "y": 1144,
                        "w": 452,
                        "h": 495,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 717,
                        "y": 1144,
                        "w": 452,
                        "h": 495,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 1642,
                        "y": 1931,
                        "w": 334,
                        "h": 500,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  },
                  {
                        "x": 2076,
                        "y": 1932,
                        "w": 333,
                        "h": 499,
                        "rotate": 0.0,
                        "label": "Slot 17",
                        "layer_index": 17
                  },
                  {
                        "x": 329,
                        "y": 1975,
                        "w": 329,
                        "h": 406,
                        "rotate": 0.0,
                        "label": "Slot 18",
                        "layer_index": 18
                  },
                  {
                        "x": 731,
                        "y": 1975,
                        "w": 329,
                        "h": 406,
                        "rotate": 0.0,
                        "label": "Slot 19",
                        "layer_index": 19
                  },
                  {
                        "x": 1132,
                        "y": 1975,
                        "w": 329,
                        "h": 406,
                        "rotate": 0.0,
                        "label": "Slot 20",
                        "layer_index": 20
                  },
                  {
                        "x": 65,
                        "y": 2649,
                        "w": 652,
                        "h": 721,
                        "rotate": 0.0,
                        "label": "Slot 21",
                        "layer_index": 21
                  },
                  {
                        "x": 796,
                        "y": 2649,
                        "w": 652,
                        "h": 721,
                        "rotate": 0.0,
                        "label": "Slot 22",
                        "layer_index": 22
                  },
                  {
                        "x": 1680,
                        "y": 2649,
                        "w": 708,
                        "h": 721,
                        "rotate": 0.0,
                        "label": "Slot 23",
                        "layer_index": 23
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 614,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 638,
                        "y": 28,
                        "w": 603,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1270,
                        "y": 28,
                        "w": 1189,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2543,
                        "w": 1494,
                        "h": 937,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1579,
                        "y": 2543,
                        "w": 881,
                        "h": 937,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 2030,
                        "y": 1870,
                        "w": 410,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 18,
                        "y": 1884,
                        "w": 1498,
                        "h": 589,
                        "rotate": 0.0,
                        "label": "Card 7"
                  },
                  {
                        "x": 1579,
                        "y": 1884,
                        "w": 431,
                        "h": 589,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1wtSe3dHLt47V5LX8TWq7vXQWTHRWsVM9=s0",
            "overlayFileId": "1wtSe3dHLt47V5LX8TWq7vXQWTHRWsVM9",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9uv4t5",
            "label": "Lyli",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 58,
                        "y": 122,
                        "w": 524,
                        "h": 750,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 681,
                        "y": 122,
                        "w": 524,
                        "h": 750,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1318,
                        "y": 147,
                        "w": 523,
                        "h": 749,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1893,
                        "y": 147,
                        "w": 523,
                        "h": 749,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 58,
                        "y": 938,
                        "w": 524,
                        "h": 750,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 681,
                        "y": 938,
                        "w": 524,
                        "h": 750,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1318,
                        "y": 938,
                        "w": 523,
                        "h": 749,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1893,
                        "y": 938,
                        "w": 523,
                        "h": 749,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 90,
                        "y": 1930,
                        "w": 371,
                        "h": 497,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 496,
                        "y": 1930,
                        "w": 371,
                        "h": 497,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1639,
                        "y": 1948,
                        "w": 323,
                        "h": 462,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2073,
                        "y": 1948,
                        "w": 322,
                        "h": 462,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1706,
                        "y": 2613,
                        "w": 677,
                        "h": 813,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 104,
                        "y": 2638,
                        "w": 595,
                        "h": 793,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 831,
                        "y": 2638,
                        "w": 595,
                        "h": 793,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 614,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 638,
                        "y": 28,
                        "w": 603,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1270,
                        "y": 28,
                        "w": 1189,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 30,
                        "y": 2543,
                        "w": 1482,
                        "h": 937,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1579,
                        "y": 2543,
                        "w": 881,
                        "h": 937,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 2030,
                        "y": 1880,
                        "w": 410,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 18,
                        "y": 1884,
                        "w": 1498,
                        "h": 589,
                        "rotate": 0.0,
                        "label": "Card 7"
                  },
                  {
                        "x": 1579,
                        "y": 1884,
                        "w": 421,
                        "h": 589,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/148JlCT3LeTexj2p46TgwxCo1yvb5XhLN=s0",
            "overlayFileId": "148JlCT3LeTexj2p46TgwxCo1yvb5XhLN",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9uwtqn",
            "label": "Loang Dau",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 71,
                        "y": 426,
                        "w": 498,
                        "h": 359,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 694,
                        "y": 426,
                        "w": 498,
                        "h": 358,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1382,
                        "y": 448,
                        "w": 971,
                        "h": 617,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 694,
                        "y": 899,
                        "w": 499,
                        "h": 359,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 70,
                        "y": 900,
                        "w": 498,
                        "h": 358,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1381,
                        "y": 1131,
                        "w": 971,
                        "h": 615,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 70,
                        "y": 1373,
                        "w": 500,
                        "h": 359,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 693,
                        "y": 1373,
                        "w": 499,
                        "h": 360,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 75,
                        "y": 1940,
                        "w": 524,
                        "h": 479,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 664,
                        "y": 1940,
                        "w": 526,
                        "h": 477,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1644,
                        "y": 2069,
                        "w": 317,
                        "h": 366,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2074,
                        "y": 2069,
                        "w": 317,
                        "h": 366,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 81,
                        "y": 2634,
                        "w": 908,
                        "h": 779,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 1660,
                        "y": 2922,
                        "w": 688,
                        "h": 499,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  }
            ],
            "cardRegions": [
                  {
                        "x": 1270,
                        "y": 28,
                        "w": 1189,
                        "h": 1782,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 10,
                        "y": 30,
                        "w": 614,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 660,
                        "y": 30,
                        "w": 589,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2519,
                        "w": 1492,
                        "h": 961,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1589,
                        "y": 2540,
                        "w": 881,
                        "h": 940,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1590,
                        "y": 1880,
                        "w": 431,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2020,
                        "y": 1880,
                        "w": 420,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 18,
                        "y": 1884,
                        "w": 1492,
                        "h": 589,
                        "rotate": 0.0,
                        "label": "Card 8"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1YjK3zSgFWttGK1YXarH-Pv2VpGubBLNr=s0",
            "overlayFileId": "1YjK3zSgFWttGK1YXarH-Pv2VpGubBLNr",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9uxg7v",
            "label": "Our Story",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 1759,
                        "y": 112,
                        "w": 546,
                        "h": 472,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 60,
                        "y": 482,
                        "w": 513,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 653,
                        "y": 482,
                        "w": 513,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1275,
                        "y": 650,
                        "w": 1030,
                        "h": 1071,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 60,
                        "y": 1129,
                        "w": 513,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 653,
                        "y": 1129,
                        "w": 513,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 59,
                        "y": 1910,
                        "w": 383,
                        "h": 509,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 477,
                        "y": 1910,
                        "w": 383,
                        "h": 509,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 894,
                        "y": 1910,
                        "w": 383,
                        "h": 509,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 65,
                        "y": 2593,
                        "w": 630,
                        "h": 720,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 774,
                        "y": 2593,
                        "w": 630,
                        "h": 720,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 1555,
                        "y": 2614,
                        "w": 309,
                        "h": 443,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1962,
                        "y": 2614,
                        "w": 309,
                        "h": 442,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  }
            ],
            "cardRegions": [
                  {
                        "x": 620,
                        "y": 20,
                        "w": 560,
                        "h": 1790,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 18,
                        "y": 28,
                        "w": 607,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1189,
                        "y": 28,
                        "w": 1189,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 10,
                        "y": 2540,
                        "w": 730,
                        "h": 940,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 712,
                        "y": 2540,
                        "w": 738,
                        "h": 940,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 18,
                        "y": 1863,
                        "w": 1772,
                        "h": 617,
                        "rotate": 0.0,
                        "label": "Card 6"
                  },
                  {
                        "x": 1500,
                        "y": 2530,
                        "w": 410,
                        "h": 610,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1900,
                        "y": 2540,
                        "w": 436,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1kp0S2c_b1w39Ofe-cU0loNYUhYEbZyed=s0",
            "overlayFileId": "1kp0S2c_b1w39Ofe-cU0loNYUhYEbZyed",
            "overlayOnly": true
      },
      {
            "id": "sb-ms9uy9p9",
            "label": "Red Velvet",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 177,
                        "y": 151,
                        "w": 285,
                        "h": 381,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 804,
                        "y": 152,
                        "w": 283,
                        "h": 379,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1337,
                        "y": 203,
                        "w": 502,
                        "h": 671,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1895,
                        "y": 203,
                        "w": 502,
                        "h": 671,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 177,
                        "y": 537,
                        "w": 285,
                        "h": 381,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 804,
                        "y": 538,
                        "w": 283,
                        "h": 379,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 177,
                        "y": 921,
                        "w": 285,
                        "h": 381,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 804,
                        "y": 922,
                        "w": 283,
                        "h": 379,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 1337,
                        "y": 961,
                        "w": 502,
                        "h": 671,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 1895,
                        "y": 961,
                        "w": 502,
                        "h": 671,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 177,
                        "y": 1305,
                        "w": 285,
                        "h": 379,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 804,
                        "y": 1306,
                        "w": 283,
                        "h": 377,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1662,
                        "y": 1979,
                        "w": 279,
                        "h": 399,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 2068,
                        "y": 1979,
                        "w": 279,
                        "h": 399,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 188,
                        "y": 2032,
                        "w": 381,
                        "h": 285,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 574,
                        "y": 2032,
                        "w": 381,
                        "h": 285,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  },
                  {
                        "x": 958,
                        "y": 2032,
                        "w": 381,
                        "h": 285,
                        "rotate": 0.0,
                        "label": "Slot 17",
                        "layer_index": 17
                  },
                  {
                        "x": 147,
                        "y": 2614,
                        "w": 556,
                        "h": 797,
                        "rotate": 0.0,
                        "label": "Slot 18",
                        "layer_index": 18
                  },
                  {
                        "x": 831,
                        "y": 2614,
                        "w": 556,
                        "h": 797,
                        "rotate": 0.0,
                        "label": "Slot 19",
                        "layer_index": 19
                  },
                  {
                        "x": 1680,
                        "y": 2615,
                        "w": 687,
                        "h": 797,
                        "rotate": 0.0,
                        "label": "Slot 20",
                        "layer_index": 20
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 602,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 640,
                        "y": 30,
                        "w": 610,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1270,
                        "y": 30,
                        "w": 1190,
                        "h": 1780,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2543,
                        "w": 1494,
                        "h": 937,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1579,
                        "y": 2543,
                        "w": 881,
                        "h": 937,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 2000,
                        "y": 1880,
                        "w": 420,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 18,
                        "y": 1884,
                        "w": 1498,
                        "h": 589,
                        "rotate": 0.0,
                        "label": "Card 7"
                  },
                  {
                        "x": 1600,
                        "y": 1890,
                        "w": 400,
                        "h": 589,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1njXtfHE9i6Rl7bfpJxmle7XNre-JWfOP=s0",
            "overlayFileId": "1njXtfHE9i6Rl7bfpJxmle7XNre-JWfOP",
            "overlayOnly": true
      },
      {
            "id": "sb-mwasid1g",
            "label": "White",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 2016,
                        "y": 38,
                        "w": 432,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 911,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1351,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 245,
                        "y": 333,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 911,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1351,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 2016,
                        "y": 628,
                        "w": 432,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2016,
                        "y": 1216,
                        "w": 432,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 115,
                        "y": 1372,
                        "w": 695,
                        "h": 925,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 911,
                        "y": 1466,
                        "w": 814,
                        "h": 558,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 2048,
                        "y": 1939,
                        "w": 351,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2048,
                        "y": 2637,
                        "w": 351,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 130,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 650,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1170,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 1850,
                        "y": 20,
                        "w": 614,
                        "h": 1790,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 18,
                        "y": 28,
                        "w": 1796,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 18,
                        "y": 1235,
                        "w": 1796,
                        "h": 1196,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2522,
                        "w": 1792,
                        "h": 958,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 2000,
                        "y": 1838,
                        "w": 446,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2000,
                        "y": 2536,
                        "w": 442,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1ywbBttghlkaRo537VDtXSNMR21Vb_Fnk=s0",
            "overlayFileId": "1ywbBttghlkaRo537VDtXSNMR21Vb_Fnk",
            "overlayOnly": true
      },
      {
            "id": "sb-mwaskl0p",
            "label": "Blink",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 2005,
                        "y": 38,
                        "w": 443,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1350,
                        "y": 40,
                        "w": 439,
                        "h": 580,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 911,
                        "y": 41,
                        "w": 436,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 238,
                        "y": 333,
                        "w": 442,
                        "h": 583,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 911,
                        "y": 625,
                        "w": 437,
                        "h": 587,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1350,
                        "y": 625,
                        "w": 436,
                        "h": 585,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 2016,
                        "y": 628,
                        "w": 432,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2016,
                        "y": 1213,
                        "w": 432,
                        "h": 581,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 115,
                        "y": 1372,
                        "w": 696,
                        "h": 926,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 911,
                        "y": 1443,
                        "w": 814,
                        "h": 581,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 2048,
                        "y": 1939,
                        "w": 353,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2048,
                        "y": 2637,
                        "w": 353,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1170,
                        "y": 2662,
                        "w": 515,
                        "h": 685,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 130,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 649,
                        "y": 2667,
                        "w": 516,
                        "h": 684,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 0,
                        "w": 1824,
                        "h": 1230,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1803,
                        "y": 28,
                        "w": 674,
                        "h": 1782,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 30,
                        "y": 1240,
                        "w": 1780,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2480,
                        "w": 1796,
                        "h": 1028,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 2000,
                        "y": 1838,
                        "w": 446,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2000,
                        "y": 2536,
                        "w": 442,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1m3n2kYcq6lLCRvp7V15Ee0EiJz19u82N=s0",
            "overlayFileId": "1m3n2kYcq6lLCRvp7V15Ee0EiJz19u82N",
            "overlayOnly": true
      },
      {
            "id": "sb-mwasmrrc",
            "label": "Dot Star",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 2016,
                        "y": 38,
                        "w": 432,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 911,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1351,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 245,
                        "y": 333,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 911,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1351,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 2016,
                        "y": 628,
                        "w": 432,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2016,
                        "y": 1216,
                        "w": 432,
                        "h": 578,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 115,
                        "y": 1372,
                        "w": 695,
                        "h": 925,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 911,
                        "y": 1466,
                        "w": 814,
                        "h": 558,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 2048,
                        "y": 1939,
                        "w": 351,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2048,
                        "y": 2637,
                        "w": 351,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 130,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 650,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1170,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 1796,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1849,
                        "y": 28,
                        "w": 614,
                        "h": 1772,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 18,
                        "y": 1235,
                        "w": 1796,
                        "h": 1196,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2522,
                        "w": 1796,
                        "h": 958,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 2000,
                        "y": 1838,
                        "w": 446,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2000,
                        "y": 2536,
                        "w": 442,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1SitADcMnGKEtMwg55vZuAA7vPhu0_WUb=s0",
            "overlayFileId": "1SitADcMnGKEtMwg55vZuAA7vPhu0_WUb",
            "overlayOnly": true
      },
      {
            "id": "sb-mwaso5io",
            "label": "Hoa nhi",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 2013,
                        "y": 35,
                        "w": 439,
                        "h": 584,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 911,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1351,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 245,
                        "y": 333,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 911,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1351,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 2014,
                        "y": 625,
                        "w": 437,
                        "h": 583,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2014,
                        "y": 1213,
                        "w": 437,
                        "h": 583,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 113,
                        "y": 1370,
                        "w": 700,
                        "h": 930,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 908,
                        "y": 1463,
                        "w": 819,
                        "h": 563,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 2046,
                        "y": 1937,
                        "w": 354,
                        "h": 464,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2046,
                        "y": 2634,
                        "w": 355,
                        "h": 465,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 115,
                        "y": 2665,
                        "w": 520,
                        "h": 685,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 648,
                        "y": 2665,
                        "w": 520,
                        "h": 686,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1177,
                        "y": 2665,
                        "w": 520,
                        "h": 685,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 1796,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1849,
                        "y": 28,
                        "w": 614,
                        "h": 1782,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 18,
                        "y": 1235,
                        "w": 1796,
                        "h": 1196,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2522,
                        "w": 1796,
                        "h": 958,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 2000,
                        "y": 1838,
                        "w": 446,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2000,
                        "y": 2536,
                        "w": 442,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/16PTcKb6RVFXF-kFwZrLri1V_KlYcZqdA=s0",
            "overlayFileId": "16PTcKb6RVFXF-kFwZrLri1V_KlYcZqdA",
            "overlayOnly": true
      },
      {
            "id": "sb-mwasp5bw",
            "label": "Rainfbow",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 2013,
                        "y": 35,
                        "w": 439,
                        "h": 584,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 911,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1351,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 245,
                        "y": 333,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 911,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1351,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 2014,
                        "y": 625,
                        "w": 437,
                        "h": 583,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2014,
                        "y": 1213,
                        "w": 437,
                        "h": 583,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 113,
                        "y": 1370,
                        "w": 700,
                        "h": 930,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 908,
                        "y": 1463,
                        "w": 819,
                        "h": 563,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 2046,
                        "y": 1937,
                        "w": 354,
                        "h": 464,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2046,
                        "y": 2635,
                        "w": 354,
                        "h": 464,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 115,
                        "y": 2665,
                        "w": 520,
                        "h": 685,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 648,
                        "y": 2665,
                        "w": 520,
                        "h": 685,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1177,
                        "y": 2665,
                        "w": 520,
                        "h": 685,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 1796,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1849,
                        "y": 28,
                        "w": 614,
                        "h": 1782,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 18,
                        "y": 1235,
                        "w": 1796,
                        "h": 1196,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2522,
                        "w": 1796,
                        "h": 958,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 2000,
                        "y": 1830,
                        "w": 446,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2000,
                        "y": 2536,
                        "w": 442,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1BJvSUQ3lLYbmcIfvkwUb4O_aDoR25HlB=s0",
            "overlayFileId": "1BJvSUQ3lLYbmcIfvkwUb4O_aDoR25HlB",
            "overlayOnly": true
      },
      {
            "id": "sb-mwasqzht",
            "label": "Pink line",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 892,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1332,
                        "y": 41,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 2003,
                        "y": 141,
                        "w": 286,
                        "h": 382,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 226,
                        "y": 333,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 2003,
                        "y": 533,
                        "w": 286,
                        "h": 382,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 892,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1332,
                        "y": 625,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2003,
                        "y": 924,
                        "w": 286,
                        "h": 382,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 2003,
                        "y": 1314,
                        "w": 286,
                        "h": 382,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 96,
                        "y": 1337,
                        "w": 695,
                        "h": 925,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 891,
                        "y": 1703,
                        "w": 814,
                        "h": 558,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2029,
                        "y": 1939,
                        "w": 351,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 2029,
                        "y": 2637,
                        "w": 351,
                        "h": 461,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 111,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 631,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 1151,
                        "y": 2667,
                        "w": 515,
                        "h": 680,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  }
            ],
            "cardRegions": [
                  {
                        "x": 0,
                        "y": 28,
                        "w": 1793,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1828,
                        "y": 28,
                        "w": 614,
                        "h": 1782,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 0,
                        "y": 1235,
                        "w": 1796,
                        "h": 1196,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 0,
                        "y": 2522,
                        "w": 1803,
                        "h": 958,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1979,
                        "y": 1838,
                        "w": 446,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1970,
                        "y": 2540,
                        "w": 446,
                        "h": 593,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/122D46S9dv6pAru7ub8BfRVejPHo_0Pa4=s0",
            "overlayFileId": "122D46S9dv6pAru7ub8BfRVejPHo_0Pa4",
            "overlayOnly": true
      },
      {
            "id": "sb-mwassj0v",
            "label": "Flower Button",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 65,
                        "y": 83,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 449,
                        "y": 83,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 834,
                        "y": 83,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1297,
                        "y": 107,
                        "w": 516,
                        "h": 350,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 2025,
                        "y": 408,
                        "w": 354,
                        "h": 469,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1297,
                        "y": 503,
                        "w": 516,
                        "h": 350,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 65,
                        "y": 608,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 449,
                        "y": 608,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 834,
                        "y": 608,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 1297,
                        "y": 899,
                        "w": 516,
                        "h": 350,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 2025,
                        "y": 1066,
                        "w": 354,
                        "h": 469,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 65,
                        "y": 1135,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 449,
                        "y": 1135,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 834,
                        "y": 1135,
                        "w": 373,
                        "h": 514,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1297,
                        "y": 1295,
                        "w": 516,
                        "h": 350,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 1602,
                        "y": 1903,
                        "w": 843,
                        "h": 1563,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  },
                  {
                        "x": 120,
                        "y": 2100,
                        "w": 980,
                        "h": 620,
                        "rotate": 5.0,
                        "label": "Slot 17",
                        "layer_index": 17
                  },
                  {
                        "x": 140,
                        "y": 2750,
                        "w": 970,
                        "h": 620,
                        "rotate": -8.0,
                        "label": "Slot 18",
                        "layer_index": 18
                  },
                  {
                        "x": 1328,
                        "y": 2852,
                        "w": 628,
                        "h": 459,
                        "rotate": 0.0,
                        "label": "Slot 19",
                        "layer_index": 19
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 14,
                        "w": 1224,
                        "h": 1814,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1240,
                        "y": 20,
                        "w": 635,
                        "h": 1779,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1980,
                        "y": 309,
                        "w": 430,
                        "h": 601,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 18,
                        "y": 1884,
                        "w": 1192,
                        "h": 1596,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1260,
                        "y": 1890,
                        "w": 1210,
                        "h": 1590,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 2000,
                        "y": 980,
                        "w": 410,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1ueNnETYi3Of6Of3D0aPVC9bXPZ07ychS=s0",
            "overlayFileId": "1ueNnETYi3Of6Of3D0aPVC9bXPZ07ychS",
            "overlayOnly": true
      },
      {
            "id": "sb-mwasxnb3",
            "label": "Sweetie Brown",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 63,
                        "y": 73,
                        "w": 305,
                        "h": 212,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1283,
                        "y": 95,
                        "w": 497,
                        "h": 370,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 1910,
                        "y": 317,
                        "w": 504,
                        "h": 654,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 115,
                        "y": 415,
                        "w": 998,
                        "h": 1298,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 1283,
                        "y": 520,
                        "w": 497,
                        "h": 370,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1283,
                        "y": 946,
                        "w": 497,
                        "h": 370,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1910,
                        "y": 1077,
                        "w": 504,
                        "h": 654,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1283,
                        "y": 1371,
                        "w": 497,
                        "h": 370,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 1423,
                        "y": 1980,
                        "w": 320,
                        "h": 430,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 1941,
                        "y": 1981,
                        "w": 320,
                        "h": 429,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 125,
                        "y": 2125,
                        "w": 975,
                        "h": 726,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 1367,
                        "y": 2624,
                        "w": 961,
                        "h": 710,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 131,
                        "y": 2973,
                        "w": 578,
                        "h": 432,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  }
            ],
            "cardRegions": [
                  {
                        "x": 20,
                        "y": 20,
                        "w": 1196,
                        "h": 1800,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1220,
                        "y": 20,
                        "w": 613,
                        "h": 1800,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1860,
                        "y": 30,
                        "w": 610,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 20,
                        "y": 1840,
                        "w": 1192,
                        "h": 1649,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1240,
                        "y": 2480,
                        "w": 1230,
                        "h": 1000,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1860,
                        "y": 1830,
                        "w": 460,
                        "h": 635,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1360,
                        "y": 1840,
                        "w": 460,
                        "h": 624,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1OLm63tg4EqbZnBR2zL_sGaRXrWoTzgOX=s0",
            "overlayFileId": "1OLm63tg4EqbZnBR2zL_sGaRXrWoTzgOX",
            "overlayOnly": true
      },
      {
            "id": "sb-mwaszcxa",
            "label": "The Model",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 2012,
                        "y": 37,
                        "w": 445,
                        "h": 585,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 33,
                        "y": 55,
                        "w": 384,
                        "h": 569,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 7
                  },
                  {
                        "x": 1268,
                        "y": 55,
                        "w": 532,
                        "h": 454,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 3
                  },
                  {
                        "x": 1268,
                        "y": 550,
                        "w": 532,
                        "h": 454,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 4
                  },
                  {
                        "x": 2012,
                        "y": 625,
                        "w": 445,
                        "h": 585,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 5
                  },
                  {
                        "x": 1268,
                        "y": 1045,
                        "w": 532,
                        "h": 727,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 6
                  },
                  {
                        "x": 30,
                        "y": 50,
                        "w": 1160,
                        "h": 1740,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 2
                  },
                  {
                        "x": 807,
                        "y": 1211,
                        "w": 384,
                        "h": 569,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 8
                  },
                  {
                        "x": 2012,
                        "y": 1214,
                        "w": 445,
                        "h": 585,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 9
                  },
                  {
                        "x": 26,
                        "y": 1897,
                        "w": 445,
                        "h": 524,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 10
                  },
                  {
                        "x": 475,
                        "y": 1898,
                        "w": 725,
                        "h": 1575,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 11
                  },
                  {
                        "x": 1453,
                        "y": 1976,
                        "w": 344,
                        "h": 492,
                        "rotate": 0.0,
                        "label": "Slot 17",
                        "layer_index": 12
                  },
                  {
                        "x": 1897,
                        "y": 1976,
                        "w": 344,
                        "h": 492,
                        "rotate": 0.0,
                        "label": "Slot 18",
                        "layer_index": 13
                  },
                  {
                        "x": 26,
                        "y": 2422,
                        "w": 445,
                        "h": 524,
                        "rotate": 0.0,
                        "label": "Slot 19",
                        "layer_index": 14
                  },
                  {
                        "x": 1981,
                        "y": 2659,
                        "w": 404,
                        "h": 659,
                        "rotate": 0.0,
                        "label": "Slot 20",
                        "layer_index": 16
                  },
                  {
                        "x": 1241,
                        "y": 2812,
                        "w": 992,
                        "h": 663,
                        "rotate": 0.0,
                        "label": "Slot 21",
                        "layer_index": 15
                  },
                  {
                        "x": 26,
                        "y": 2947,
                        "w": 445,
                        "h": 524,
                        "rotate": 0.0,
                        "label": "Slot 22",
                        "layer_index": 17
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 0,
                        "w": 1210,
                        "h": 1800,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1217,
                        "y": 28,
                        "w": 624,
                        "h": 1800,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1849,
                        "y": 28,
                        "w": 610,
                        "h": 1793,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 10,
                        "y": 1880,
                        "w": 1200,
                        "h": 1600,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1230,
                        "y": 2590,
                        "w": 1240,
                        "h": 890,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1860,
                        "y": 1930,
                        "w": 420,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1414,
                        "y": 1930,
                        "w": 426,
                        "h": 585,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1fw0YcjSGhlErj_oz58bx6A6I6ckm3OCK=s0",
            "overlayFileId": "1fw0YcjSGhlErj_oz58bx6A6I6ckm3OCK",
            "overlayOnly": true
      },
      {
            "id": "sb-mwat2kbu",
            "label": "Pink Dot Button",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 1918,
                        "y": 127,
                        "w": 486,
                        "h": 478,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1120,
                        "y": 290,
                        "w": 380,
                        "h": 500,
                        "rotate": -11.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 710,
                        "y": 370,
                        "w": 370,
                        "h": 490,
                        "rotate": -10.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 280,
                        "y": 440,
                        "w": 390,
                        "h": 500,
                        "rotate": -10.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 1918,
                        "y": 685,
                        "w": 486,
                        "h": 478,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1918,
                        "y": 1243,
                        "w": 486,
                        "h": 478,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1285,
                        "y": 1317,
                        "w": 427,
                        "h": 433,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 142,
                        "y": 1323,
                        "w": 1002,
                        "h": 356,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 26,
                        "y": 1924,
                        "w": 1172,
                        "h": 722,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 1427,
                        "y": 1977,
                        "w": 324,
                        "h": 473,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1908,
                        "y": 1977,
                        "w": 324,
                        "h": 473,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 1328,
                        "y": 2662,
                        "w": 511,
                        "h": 722,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1895,
                        "y": 2662,
                        "w": 511,
                        "h": 722,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 89,
                        "y": 2829,
                        "w": 662,
                        "h": 512,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  }
            ],
            "cardRegions": [
                  {
                        "x": 1850,
                        "y": 20,
                        "w": 610,
                        "h": 1793,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 18,
                        "y": 28,
                        "w": 1796,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 20,
                        "y": 1890,
                        "w": 1207,
                        "h": 1589,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 1231,
                        "w": 1772,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1259,
                        "y": 2571,
                        "w": 1200,
                        "h": 909,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1380,
                        "y": 1920,
                        "w": 410,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1863,
                        "y": 1922,
                        "w": 407,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1Yfv3UqyMwcuqgUMkEcbhJw5GLspRVcBm=s0",
            "overlayFileId": "1Yfv3UqyMwcuqgUMkEcbhJw5GLspRVcBm",
            "overlayOnly": true
      },
      {
            "id": "sb-mwat6h6n",
            "label": "DiCii Canvas",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 1577,
                        "y": 43,
                        "w": 429,
                        "h": 574,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 2017,
                        "y": 43,
                        "w": 429,
                        "h": 574,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 59,
                        "y": 332,
                        "w": 520,
                        "h": 331,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 916,
                        "y": 335,
                        "w": 430,
                        "h": 576,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 1577,
                        "y": 629,
                        "w": 429,
                        "h": 574,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 2017,
                        "y": 629,
                        "w": 429,
                        "h": 574,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 59,
                        "y": 696,
                        "w": 520,
                        "h": 331,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 59,
                        "y": 1059,
                        "w": 520,
                        "h": 331,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 1497,
                        "y": 1336,
                        "w": 347,
                        "h": 347,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 1977,
                        "y": 1336,
                        "w": 405,
                        "h": 345,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 770,
                        "y": 1340,
                        "w": 584,
                        "h": 343,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 59,
                        "y": 1423,
                        "w": 520,
                        "h": 331,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 84,
                        "y": 1939,
                        "w": 520,
                        "h": 473,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 656,
                        "y": 1939,
                        "w": 520,
                        "h": 473,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1629,
                        "y": 2058,
                        "w": 346,
                        "h": 392,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  },
                  {
                        "x": 2058,
                        "y": 2058,
                        "w": 346,
                        "h": 392,
                        "rotate": 0.0,
                        "label": "Slot 16",
                        "layer_index": 16
                  },
                  {
                        "x": 133,
                        "y": 2647,
                        "w": 1264,
                        "h": 730,
                        "rotate": 0.0,
                        "label": "Slot 17",
                        "layer_index": 17
                  },
                  {
                        "x": 1812,
                        "y": 2724,
                        "w": 430,
                        "h": 576,
                        "rotate": 0.0,
                        "label": "Slot 18",
                        "layer_index": 18
                  }
            ],
            "cardRegions": [
                  {
                        "x": 670,
                        "y": 20,
                        "w": 1789,
                        "h": 1192,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 18,
                        "y": 28,
                        "w": 617,
                        "h": 1800,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 680,
                        "y": 1240,
                        "w": 1790,
                        "h": 570,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 18,
                        "y": 2519,
                        "w": 1492,
                        "h": 986,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1590,
                        "y": 2540,
                        "w": 880,
                        "h": 940,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 18,
                        "y": 1856,
                        "w": 1492,
                        "h": 649,
                        "rotate": 0.0,
                        "label": "Card 6"
                  },
                  {
                        "x": 1590,
                        "y": 1880,
                        "w": 420,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2030,
                        "y": 1880,
                        "w": 410,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1Bq2IK3lDVMjjqn3bkODM1QOuN9TAuQHz=s0",
            "overlayFileId": "1Bq2IK3lDVMjjqn3bkODM1QOuN9TAuQHz",
            "overlayOnly": true
      },
      {
            "id": "sb-mwat8kv0",
            "label": "Green Ye",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 1349,
                        "y": 40,
                        "w": 478,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1972,
                        "y": 40,
                        "w": 478,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 223,
                        "y": 45,
                        "w": 973,
                        "h": 1744,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1349,
                        "y": 627,
                        "w": 478,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 1972,
                        "y": 627,
                        "w": 478,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1349,
                        "y": 1215,
                        "w": 478,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1972,
                        "y": 1215,
                        "w": 478,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1456,
                        "y": 1935,
                        "w": 339,
                        "h": 487,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 1953,
                        "y": 1935,
                        "w": 339,
                        "h": 487,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 87,
                        "y": 1940,
                        "w": 1053,
                        "h": 736,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1333,
                        "y": 2641,
                        "w": 1030,
                        "h": 682,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 85,
                        "y": 2752,
                        "w": 708,
                        "h": 653,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 686,
                        "y": 3038,
                        "w": 451,
                        "h": 279,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  }
            ],
            "cardRegions": [
                  {
                        "x": 20,
                        "y": 20,
                        "w": 1180,
                        "h": 1780,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1240,
                        "y": 20,
                        "w": 610,
                        "h": 1790,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1860,
                        "y": 30,
                        "w": 600,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 20,
                        "y": 1890,
                        "w": 1190,
                        "h": 1590,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1240,
                        "y": 2550,
                        "w": 1228,
                        "h": 930,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1420,
                        "y": 1880,
                        "w": 426,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1910,
                        "y": 1890,
                        "w": 420,
                        "h": 580,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1ed8wgZ6NXt4jzmZhAqGGFYfyOclzRP6E=s0",
            "overlayFileId": "1ed8wgZ6NXt4jzmZhAqGGFYfyOclzRP6E",
            "overlayOnly": true
      },
      {
            "id": "sb-mwatbdva",
            "label": "DiCii Frozen",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 911,
                        "y": 40,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1352,
                        "y": 40,
                        "w": 435,
                        "h": 579,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 2042,
                        "y": 54,
                        "w": 388,
                        "h": 556,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 246,
                        "y": 332,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 911,
                        "y": 624,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 1352,
                        "y": 624,
                        "w": 435,
                        "h": 582,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 2042,
                        "y": 638,
                        "w": 388,
                        "h": 556,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 2042,
                        "y": 1224,
                        "w": 388,
                        "h": 556,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 44,
                        "y": 1495,
                        "w": 556,
                        "h": 388,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 629,
                        "y": 1495,
                        "w": 556,
                        "h": 388,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1214,
                        "y": 1495,
                        "w": 556,
                        "h": 388,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 200,
                        "y": 2150,
                        "w": 730,
                        "h": 1330,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1150,
                        "y": 2150,
                        "w": 740,
                        "h": 1320,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 1950,
                        "y": 2290,
                        "w": 410,
                        "h": 550,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 1950,
                        "y": 2920,
                        "w": 410,
                        "h": 500,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 1860,
                        "y": 0,
                        "w": 600,
                        "h": 1821,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 20,
                        "y": 30,
                        "w": 1782,
                        "h": 1202,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 20,
                        "y": 2150,
                        "w": 922,
                        "h": 1351,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 980,
                        "y": 2160,
                        "w": 910,
                        "h": 1347,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 10,
                        "y": 1460,
                        "w": 1790,
                        "h": 460,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 1950,
                        "y": 2200,
                        "w": 420,
                        "h": 640,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 1950,
                        "y": 2840,
                        "w": 420,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1nh3f-u6jlg5Xgx1w_CtKM6Aj_0vuHvSa=s0",
            "overlayFileId": "1nh3f-u6jlg5Xgx1w_CtKM6Aj_0vuHvSa",
            "overlayOnly": true
      },
      {
            "id": "sb-mwathw79",
            "label": "Lucky Love",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 1939,
                        "y": 238,
                        "w": 440,
                        "h": 618,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 121,
                        "y": 258,
                        "w": 439,
                        "h": 616,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 667,
                        "y": 258,
                        "w": 439,
                        "h": 616,
                        "rotate": 0.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 1313,
                        "y": 276,
                        "w": 458,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 1313,
                        "y": 767,
                        "w": 458,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 121,
                        "y": 958,
                        "w": 439,
                        "h": 616,
                        "rotate": 0.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 667,
                        "y": 958,
                        "w": 439,
                        "h": 616,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1939,
                        "y": 969,
                        "w": 440,
                        "h": 618,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 1313,
                        "y": 1258,
                        "w": 458,
                        "h": 325,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 74,
                        "y": 2056,
                        "w": 854,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 1050,
                        "y": 2056,
                        "w": 854,
                        "h": 1200,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 2034,
                        "y": 2081,
                        "w": 353,
                        "h": 496,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 2037,
                        "y": 2799,
                        "w": 347,
                        "h": 488,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 1192,
                        "h": 1772,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1230,
                        "y": 30,
                        "w": 600,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1860,
                        "y": 30,
                        "w": 600,
                        "h": 1780,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 20,
                        "y": 1970,
                        "w": 970,
                        "h": 1370,
                        "rotate": 0.0,
                        "label": "Card 4"
                  },
                  {
                        "x": 1000,
                        "y": 1970,
                        "w": 950,
                        "h": 1370,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 2000,
                        "y": 2040,
                        "w": 410,
                        "h": 580,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2000,
                        "y": 2750,
                        "w": 420,
                        "h": 590,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/13MmX3cklPQCJsF5kToPpl3LZ1eavD7hN=s0",
            "overlayFileId": "13MmX3cklPQCJsF5kToPpl3LZ1eavD7hN",
            "overlayOnly": true
      },
      {
            "id": "sb-mwatknlf",
            "label": "Sweet B",
            "packageTier": "short",
            "title": "SELFBOOTH FRAME",
            "signature": "",
            "footer": "",
            "width": 2480,
            "height": 3508,
            "slots": [
                  {
                        "x": 1338,
                        "y": 413,
                        "w": 409,
                        "h": 442,
                        "rotate": 0.0,
                        "label": "Slot 1",
                        "layer_index": 1
                  },
                  {
                        "x": 1957,
                        "y": 413,
                        "w": 409,
                        "h": 442,
                        "rotate": 0.0,
                        "label": "Slot 2",
                        "layer_index": 2
                  },
                  {
                        "x": 110,
                        "y": 470,
                        "w": 430,
                        "h": 460,
                        "rotate": -15.0,
                        "label": "Slot 3",
                        "layer_index": 3
                  },
                  {
                        "x": 680,
                        "y": 480,
                        "w": 440,
                        "h": 440,
                        "rotate": 15.0,
                        "label": "Slot 4",
                        "layer_index": 4
                  },
                  {
                        "x": 130,
                        "y": 1110,
                        "w": 440,
                        "h": 440,
                        "rotate": 15.0,
                        "label": "Slot 5",
                        "layer_index": 5
                  },
                  {
                        "x": 670,
                        "y": 1090,
                        "w": 410,
                        "h": 470,
                        "rotate": -15.0,
                        "label": "Slot 6",
                        "layer_index": 6
                  },
                  {
                        "x": 1338,
                        "y": 1101,
                        "w": 409,
                        "h": 442,
                        "rotate": 0.0,
                        "label": "Slot 7",
                        "layer_index": 7
                  },
                  {
                        "x": 1957,
                        "y": 1101,
                        "w": 409,
                        "h": 442,
                        "rotate": 0.0,
                        "label": "Slot 8",
                        "layer_index": 8
                  },
                  {
                        "x": 1609,
                        "y": 1951,
                        "w": 325,
                        "h": 351,
                        "rotate": 0.0,
                        "label": "Slot 9",
                        "layer_index": 9
                  },
                  {
                        "x": 2064,
                        "y": 1951,
                        "w": 325,
                        "h": 351,
                        "rotate": 0.0,
                        "label": "Slot 10",
                        "layer_index": 10
                  },
                  {
                        "x": 953,
                        "y": 2017,
                        "w": 348,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 11",
                        "layer_index": 11
                  },
                  {
                        "x": 208,
                        "y": 2019,
                        "w": 348,
                        "h": 322,
                        "rotate": 0.0,
                        "label": "Slot 12",
                        "layer_index": 12
                  },
                  {
                        "x": 1760,
                        "y": 2686,
                        "w": 505,
                        "h": 547,
                        "rotate": 0.0,
                        "label": "Slot 13",
                        "layer_index": 13
                  },
                  {
                        "x": 166,
                        "y": 2700,
                        "w": 492,
                        "h": 533,
                        "rotate": 0.0,
                        "label": "Slot 14",
                        "layer_index": 14
                  },
                  {
                        "x": 859,
                        "y": 2700,
                        "w": 492,
                        "h": 533,
                        "rotate": 0.0,
                        "label": "Slot 15",
                        "layer_index": 15
                  }
            ],
            "cardRegions": [
                  {
                        "x": 18,
                        "y": 28,
                        "w": 1182,
                        "h": 1782,
                        "rotate": 0.0,
                        "label": "Card 1"
                  },
                  {
                        "x": 1250,
                        "y": 30,
                        "w": 600,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 2"
                  },
                  {
                        "x": 1860,
                        "y": 30,
                        "w": 590,
                        "h": 1770,
                        "rotate": 0.0,
                        "label": "Card 3"
                  },
                  {
                        "x": 10,
                        "y": 2500,
                        "w": 1482,
                        "h": 980,
                        "rotate": -0.1,
                        "label": "Card 4"
                  },
                  {
                        "x": 1560,
                        "y": 2500,
                        "w": 900,
                        "h": 980,
                        "rotate": 0.0,
                        "label": "Card 5"
                  },
                  {
                        "x": 20,
                        "y": 1850,
                        "w": 1480,
                        "h": 600,
                        "rotate": 0.0,
                        "label": "Card 6"
                  },
                  {
                        "x": 1560,
                        "y": 1849,
                        "w": 420,
                        "h": 591,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  },
                  {
                        "x": 2020,
                        "y": 1850,
                        "w": 410,
                        "h": 591,
                        "rotate": 0.0,
                        "label": "Móc khoá"
                  }
            ],
            "bg": "#fffdfb",
            "slotBg": "#fbf4ef",
            "border": "#ead9cf",
            "accent": "#7b1f2a",
            "text": "#2f241f",
            "overlayUrl": "https://lh3.googleusercontent.com/d/1XXLp7e3Xql07VquCkmDL7mtVInORlb7-=s0",
            "overlayFileId": "1XXLp7e3Xql07VquCkmDL7mtVInORlb7-",
            "overlayOnly": true
      }
];
    var SB_EMBEDDED_FRAME_PRESETS = JSON.parse(JSON.stringify(SB_FRAME_PRESETS));
    var SB_PTCARD_FRAME_PRESETS = [
      {
            "id": "ptcard-backdo",
            "kind": "ptcard",
            "label": "Backdo",
            "topic": "backdo",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1DrplF81XMck8Ld_ChbrPYErRd5KjJxLq=s0",
            "frontFileId": "1DrplF81XMck8Ld_ChbrPYErRd5KjJxLq",
            "backUrl": "https://lh3.googleusercontent.com/d/1z3r4FF5TZi2CBCTjzBMtCfflN_l3PsyC=s0",
            "backFileId": "1z3r4FF5TZi2CBCTjzBMtCfflN_l3PsyC"
      },
      {
            "id": "ptcard-capturring",
            "kind": "ptcard",
            "label": "Capturring",
            "topic": "capturring",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 135,
                        "y": 247,
                        "w": 1786,
                        "h": 946,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1CaUs-RWzOHl_8amPk-NM_jnGm7QlM3fu=s0",
            "frontFileId": "1CaUs-RWzOHl_8amPk-NM_jnGm7QlM3fu",
            "backUrl": "https://lh3.googleusercontent.com/d/1FLPKQtAFisINAfCYugzw-Kyh7T5DS7H8=s0",
            "backFileId": "1FLPKQtAFisINAfCYugzw-Kyh7T5DS7H8"
      },
      {
            "id": "ptcard-cham-bi",
            "kind": "ptcard",
            "label": "Cham Bi",
            "topic": "cham bi",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 117,
                        "y": 116,
                        "w": 1820,
                        "h": 1068,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1sxhgehdZ6vy4AGQHhGme7drMmw30ndPb=s0",
            "frontFileId": "1sxhgehdZ6vy4AGQHhGme7drMmw30ndPb",
            "backUrl": "https://lh3.googleusercontent.com/d/1u4WBoDYadbuFCTTA83MQYANwrSrmtoyx=s0",
            "backFileId": "1u4WBoDYadbuFCTTA83MQYANwrSrmtoyx"
      },
      {
            "id": "ptcard-disney",
            "kind": "ptcard",
            "label": "Disney",
            "topic": "disney",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1vGTRcmBRGZ5fcNSK8bblxCv8PaO0SSC2=s0",
            "frontFileId": "1vGTRcmBRGZ5fcNSK8bblxCv8PaO0SSC2",
            "backUrl": "https://lh3.googleusercontent.com/d/1VunR8RVBTDB2xTnSQRRxKfRkklhNXifw=s0",
            "backFileId": "1VunR8RVBTDB2xTnSQRRxKfRkklhNXifw"
      },
      {
            "id": "ptcard-film",
            "kind": "ptcard",
            "label": "Film",
            "topic": "film",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1qaWOxsZY8uAHNxSUfWtVB4SMAD8-I8mn=s0",
            "frontFileId": "1qaWOxsZY8uAHNxSUfWtVB4SMAD8-I8mn",
            "backUrl": "https://lh3.googleusercontent.com/d/1g_2IYVZk17eYe2moP8uZR8b5O1phvtDf=s0",
            "backFileId": "1g_2IYVZk17eYe2moP8uZR8b5O1phvtDf"
      },
      {
            "id": "ptcard-lily",
            "kind": "ptcard",
            "label": "Lily",
            "topic": "lily",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1Ji9pOdzIhx4G4BCjDaD-wHov6wmZTgT8=s0",
            "frontFileId": "1Ji9pOdzIhx4G4BCjDaD-wHov6wmZTgT8",
            "backUrl": "https://lh3.googleusercontent.com/d/1tmxRWDHjUfm7KC-4nkuYkDf0H0_9OBFN=s0",
            "backFileId": "1tmxRWDHjUfm7KC-4nkuYkDf0H0_9OBFN"
      },
      {
            "id": "ptcard-loang",
            "kind": "ptcard",
            "label": "Loang",
            "topic": "loang",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 0,
                        "y": 0,
                        "w": 2055,
                        "h": 1299,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1eAnBoU0N2L-qKLYA6siZm4iH-8PkN3oE=s0",
            "frontFileId": "1eAnBoU0N2L-qKLYA6siZm4iH-8PkN3oE",
            "backUrl": "https://lh3.googleusercontent.com/d/1qjUV2QRuzmDFszBIxlgftGeBTnD6HoyP=s0",
            "backFileId": "1qjUV2QRuzmDFszBIxlgftGeBTnD6HoyP"
      },
      {
            "id": "ptcard-ourstory",
            "kind": "ptcard",
            "label": "Ourstory",
            "topic": "ourstory",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/17LcqV5Kugefbm-AYm_5V6DvzuCg6Ha_r=s0",
            "frontFileId": "17LcqV5Kugefbm-AYm_5V6DvzuCg6Ha_r",
            "backUrl": "https://lh3.googleusercontent.com/d/1Gg6JBK0st-PavOTkfQXwsf7cC2g4t0fL=s0",
            "backFileId": "1Gg6JBK0st-PavOTkfQXwsf7cC2g4t0fL"
      },
      {
            "id": "ptcard-red",
            "kind": "ptcard",
            "label": "Red",
            "topic": "red",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1DQt-Y9ks5_PIwI6Okn1nnWt_uz9Hqxhf=s0",
            "frontFileId": "1DQt-Y9ks5_PIwI6Okn1nnWt_uz9Hqxhf",
            "backUrl": "https://lh3.googleusercontent.com/d/1yYgFSxRjonCsFnFTMMf0spNYggttuxlC=s0",
            "backFileId": "1yYgFSxRjonCsFnFTMMf0spNYggttuxlC"
      },
      {
            "id": "ptcard-vogue",
            "kind": "ptcard",
            "label": "Vogue",
            "topic": "vogue",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1xa0O5OscHEhNb36GFojbJ_2cPSeM0uQJ=s0",
            "frontFileId": "1xa0O5OscHEhNb36GFojbJ_2cPSeM0uQJ",
            "backUrl": "https://lh3.googleusercontent.com/d/1s_TewZW4cC2hJmS0YHNCUAQcPiQMzgsr=s0",
            "backFileId": "1s_TewZW4cC2hJmS0YHNCUAQcPiQMzgsr"
      },
      {
            "id": "ptcard-mttoevqk",
            "kind": "ptcard",
            "label": "Back do",
            "topic": "Back đỏ",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/18E1BXyAWDj2IW4NGnwX8fgigTqB1V_J5=s0",
            "frontFileId": "18E1BXyAWDj2IW4NGnwX8fgigTqB1V_J5",
            "backUrl": "https://lh3.googleusercontent.com/d/13eNYdMxIRBV80is09GAtxzSqi2TIS114=s0",
            "backFileId": "13eNYdMxIRBV80is09GAtxzSqi2TIS114"
      },
      {
            "id": "ptcard-mttofxte",
            "kind": "ptcard",
            "label": "Capturing",
            "topic": "Capturing Moment",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 135,
                        "y": 240,
                        "w": 1786,
                        "h": 960,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1H9pD5yEpFrmuDTSLGNY-sY73FHjoaaxO=s0",
            "frontFileId": "1H9pD5yEpFrmuDTSLGNY-sY73FHjoaaxO",
            "backUrl": "https://lh3.googleusercontent.com/d/1dUVMlHdtoi-giQcOqmMxcmzEEGWAdzxb=s0",
            "backFileId": "1dUVMlHdtoi-giQcOqmMxcmzEEGWAdzxb"
      },
      {
            "id": "ptcard-mttogpl7",
            "kind": "ptcard",
            "label": "Bò sữa",
            "topic": "Bò sữa",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 117,
                        "y": 116,
                        "w": 1820,
                        "h": 1068,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1xYssY2bYDMz9to5rq8zOqMRGe_8Rjn9m=s0",
            "frontFileId": "1xYssY2bYDMz9to5rq8zOqMRGe_8Rjn9m",
            "backUrl": "https://lh3.googleusercontent.com/d/17fTNqXIjMJ5Ma1Gor_yzLnOk8C_MOe0C=s0",
            "backFileId": "17fTNqXIjMJ5Ma1Gor_yzLnOk8C_MOe0C"
      },
      {
            "id": "ptcardisney",
            "kind": "ptcard",
            "label": "Disney",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1FVrF-kP_jafI1OkXr6lZLrjzTJARspmn=s0",
            "frontFileId": "1FVrF-kP_jafI1OkXr6lZLrjzTJARspmn",
            "backUrl": "https://lh3.googleusercontent.com/d/10KeGIGcgqnzecErRfdm_rinufBp3Jyqo=s0",
            "backFileId": "10KeGIGcgqnzecErRfdm_rinufBp3Jyqo"
      },
      {
            "id": "ptcard-mttom2ky",
            "kind": "ptcard",
            "label": "Films",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1yLpeeCu_ZtLVMuYPoNvSOkfEdDtTVtae=s0",
            "frontFileId": "1yLpeeCu_ZtLVMuYPoNvSOkfEdDtTVtae",
            "backUrl": "https://lh3.googleusercontent.com/d/1DtNQvVQ6W99wmxHXanA0E8iGrA73Y5pX=s0",
            "backFileId": "1DtNQvVQ6W99wmxHXanA0E8iGrA73Y5pX"
      },
      {
            "id": "ptcard-mttomhlg",
            "kind": "ptcard",
            "label": "Lyli",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1DD0cg41IZwpJqUX7saEzl0JffYhjcgZx=s0",
            "frontFileId": "1DD0cg41IZwpJqUX7saEzl0JffYhjcgZx",
            "backUrl": "https://lh3.googleusercontent.com/d/1UC7dAdCXiNgRZNrYh7jlXGpOje5aCb3F=s0",
            "backFileId": "1UC7dAdCXiNgRZNrYh7jlXGpOje5aCb3F"
      },
      {
            "id": "ptcard-mttopwc8",
            "kind": "ptcard",
            "label": "Dâu loang",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/10FIjGByt37zHv9a1_ph2qu43L7436Csb=s0",
            "frontFileId": "10FIjGByt37zHv9a1_ph2qu43L7436Csb",
            "backUrl": "https://lh3.googleusercontent.com/d/1_gUyp6pwulMNAaS6m2mIPc4kPdzCIwNK=s0",
            "backFileId": "1_gUyp6pwulMNAaS6m2mIPc4kPdzCIwNK"
      },
      {
            "id": "ptcard-mttoq9mn",
            "kind": "ptcard",
            "label": "Our Story",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1nV4o81bF1jiv5rHMe0lBeMjfGWk2VpVH=s0",
            "frontFileId": "1nV4o81bF1jiv5rHMe0lBeMjfGWk2VpVH",
            "backUrl": "https://lh3.googleusercontent.com/d/1rIRrcknlXgIaESpwwwiywTcg6pSUqKTq=s0",
            "backFileId": "1rIRrcknlXgIaESpwwwiywTcg6pSUqKTq"
      },
      {
            "id": "ptcard-mttoqowt",
            "kind": "ptcard",
            "label": "Red",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/18ClMiAO4BelDaA8-7cHj-7XxU4VMMJ49=s0",
            "frontFileId": "18ClMiAO4BelDaA8-7cHj-7XxU4VMMJ49",
            "backUrl": "https://lh3.googleusercontent.com/d/1hMGIZT7hq81_E2Af9bJCCGR4yHw7AOAT=s0",
            "backFileId": "1hMGIZT7hq81_E2Af9bJCCGR4yHw7AOAT"
      },
      {
            "id": "ptcard-mttor2uw",
            "kind": "ptcard",
            "label": "Vogue",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 112,
                        "y": 111,
                        "w": 1830,
                        "h": 1078,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 1,
            "backSlots": [
                  {
                        "label": "Ảnh 1",
                        "x": 113,
                        "y": 110,
                        "w": 1829,
                        "h": 1079,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1zXOYeVIOXhWukqd1EzWtsf6MvFM5G97s=s0",
            "frontFileId": "1zXOYeVIOXhWukqd1EzWtsf6MvFM5G97s",
            "backUrl": "https://lh3.googleusercontent.com/d/1hhJc1dDz_tXDa2tnshdCZdOTKymxcI6N=s0",
            "backFileId": "1hhJc1dDz_tXDa2tnshdCZdOTKymxcI6N"
      },
      {
            "id": "ptcard-mweqezwt",
            "kind": "ptcard",
            "label": "Pink Line",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 133,
                        "y": 211,
                        "w": 656,
                        "h": 876,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 910,
                        "y": 0,
                        "w": 1149,
                        "h": 1300,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "editableSides": 2,
            "backSlots": [
                  {
                        "label": "",
                        "x": 98,
                        "y": 78,
                        "w": 1860,
                        "h": 1143,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1mCVG_j4TuCSLff_qULiptAhHc5e9TxSi=s0",
            "frontFileId": "1mCVG_j4TuCSLff_qULiptAhHc5e9TxSi",
            "backUrl": "https://lh3.googleusercontent.com/d/1rZZ_vFvwxRF4KDZmwPNmg8JxxpROVkyy=s0",
            "backFileId": "1rZZ_vFvwxRF4KDZmwPNmg8JxxpROVkyy"
      },
      {
            "id": "ptcard-mweqkvn8",
            "kind": "ptcard",
            "label": "Button Vey",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 175,
                        "y": 311,
                        "w": 678,
                        "h": 678,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 1028,
                        "y": 0,
                        "w": 1027,
                        "h": 1299,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "editableSides": 2,
            "backSlots": [
                  {
                        "label": "",
                        "x": 90,
                        "y": 110,
                        "w": 1880,
                        "h": 1100,
                        "rotate": 5.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/15Mf8vE6p470_JPRUrswBc8FYkyshvbzc=s0",
            "frontFileId": "15Mf8vE6p470_JPRUrswBc8FYkyshvbzc",
            "backUrl": "https://lh3.googleusercontent.com/d/1nmrBir9YkUbkfrQWzobOLjWNBKV7r4KQ=s0",
            "backFileId": "1nmrBir9YkUbkfrQWzobOLjWNBKV7r4KQ"
      },
      {
            "id": "ptcard-mweqww69",
            "kind": "ptcard",
            "label": "Sweetie Line",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 56,
                        "y": 52,
                        "w": 919,
                        "h": 1195,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 1053,
                        "y": 0,
                        "w": 1002,
                        "h": 1299,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "editableSides": 2,
            "backSlots": [
                  {
                        "label": "",
                        "x": 112,
                        "y": 80,
                        "w": 1831,
                        "h": 1134,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1VMtBUlfXjqXh2N1MySkEDqdj-_xzylfX=s0",
            "frontFileId": "1VMtBUlfXjqXh2N1MySkEDqdj-_xzylfX",
            "backUrl": "https://lh3.googleusercontent.com/d/1hiolnlqHjeLomHl8-fvM7IsQmWD8Fh6o=s0",
            "backFileId": "1hiolnlqHjeLomHl8-fvM7IsQmWD8Fh6o"
      },
      {
            "id": "ptcard-mweqxxi2",
            "kind": "ptcard",
            "label": "The Model",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 1353,
                        "y": 57,
                        "w": 645,
                        "h": 898,
                        "rotate": 0.0,
                        "layer_index": 2
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 87,
                        "y": 344,
                        "w": 1537,
                        "h": 898,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 2,
            "backSlots": [
                  {
                        "label": "",
                        "x": 50,
                        "y": 45,
                        "w": 1960,
                        "h": 1215,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1nBQ8XRZd7Xp2337dZdyL2n6LOloxgryz=s0",
            "frontFileId": "1nBQ8XRZd7Xp2337dZdyL2n6LOloxgryz",
            "backUrl": "https://lh3.googleusercontent.com/d/15MDWwFf7Walbd0G0q566fRoViijLSc9C=s0",
            "backFileId": "15MDWwFf7Walbd0G0q566fRoViijLSc9C"
      },
      {
            "id": "ptcard-mwer0lhh",
            "kind": "ptcard",
            "label": "Ly V2",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 138,
                        "y": 201,
                        "w": 1301,
                        "h": 1017,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "editableSides": 2,
            "backSlots": [
                  {
                        "label": "",
                        "x": 111,
                        "y": 90,
                        "w": 1834,
                        "h": 1119,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1lK1ceSjgZurAeY8F5AwtuZ1K8rXzXbFr=s0",
            "frontFileId": "1lK1ceSjgZurAeY8F5AwtuZ1K8rXzXbFr",
            "backUrl": "https://lh3.googleusercontent.com/d/1nPtTI-dt6tzeOO7NGieMBv71omFQhmme=s0",
            "backFileId": "1nPtTI-dt6tzeOO7NGieMBv71omFQhmme"
      },
      {
            "id": "ptcard-mwer19fx",
            "kind": "ptcard",
            "label": "DiCii Canvas",
            "topic": "",
            "packageTier": "medium",
            "width": 2055,
            "height": 1299,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 135,
                        "y": 236,
                        "w": 827,
                        "h": 827,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 1101,
                        "y": 0,
                        "w": 954,
                        "h": 1299,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "editableSides": 2,
            "backSlots": [
                  {
                        "label": "",
                        "x": 212,
                        "y": 208,
                        "w": 1633,
                        "h": 960,
                        "rotate": 0.0,
                        "layer_index": 1
                  }
            ],
            "frontUrl": "https://lh3.googleusercontent.com/d/1q7GJWuSKt2vHMOfqVvtFhOtUMR0lN3qg=s0",
            "frontFileId": "1q7GJWuSKt2vHMOfqVvtFhOtUMR0lN3qg",
            "backUrl": "https://lh3.googleusercontent.com/d/1g3gi11VzgW73XH6rvbCvt70y0fywhiIi=s0",
            "backFileId": "1g3gi11VzgW73XH6rvbCvt70y0fywhiIi"
      }
];
    var SB_EMBEDDED_PTCARD_FRAME_PRESETS = JSON.parse(JSON.stringify(SB_PTCARD_FRAME_PRESETS));
    var ADDON_KEY_CARD_FRAME_PRESETS = [
      {
            "id": "keycard-backdo",
            "label": "Backdo",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 67,
                        "y": 92,
                        "w": 270,
                        "h": 386,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 66,
                        "y": 664,
                        "w": 270,
                        "h": 386,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\backdo.png",
            "url": "https://lh3.googleusercontent.com/d/1kwRtFdbnH2DpPPrvbVFnPZYCkLOYATit=s0",
            "drive_file_id": "1kwRtFdbnH2DpPPrvbVFnPZYCkLOYATit"
      },
      {
            "id": "keycard-capturing",
            "label": "Capturing",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 63,
                        "y": 157,
                        "w": 278,
                        "h": 346,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 63,
                        "y": 730,
                        "w": 278,
                        "h": 345,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\capturing.png",
            "url": "https://lh3.googleusercontent.com/d/1xfsB9pgYsyWLVHmT-mK1RkBM-qUwL8qV=s0",
            "drive_file_id": "1xfsB9pgYsyWLVHmT-mK1RkBM-qUwL8qV"
      },
      {
            "id": "keycard-cham-bi",
            "label": "Cham Bi",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 68,
                        "y": 94,
                        "w": 268,
                        "h": 383,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 68,
                        "y": 665,
                        "w": 268,
                        "h": 383,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\cham bi.png",
            "url": "https://lh3.googleusercontent.com/d/1AvBsNDDguiQTKxBHe_JW7nlOVaS8IUNw=s0",
            "drive_file_id": "1AvBsNDDguiQTKxBHe_JW7nlOVaS8IUNw"
      },
      {
            "id": "keycard-disney",
            "label": "Disney",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 46,
                        "y": 41,
                        "w": 310,
                        "h": 377,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 46,
                        "y": 612,
                        "w": 310,
                        "h": 377,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\disney.png",
            "url": "https://lh3.googleusercontent.com/d/1S65huYFUdYcOEN3JtlXY3LWZQaoEPwRb=s0",
            "drive_file_id": "1S65huYFUdYcOEN3JtlXY3LWZQaoEPwRb"
      },
      {
            "id": "keycard-film",
            "label": "Film",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 48,
                        "y": 46,
                        "w": 323,
                        "h": 484,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 47,
                        "y": 617,
                        "w": 323,
                        "h": 484,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\film.png",
            "url": "https://lh3.googleusercontent.com/d/1nxJ5n7sfzuVFqVcNJVTTa4wLxt85AxUf=s0",
            "drive_file_id": "1nxJ5n7sfzuVFqVcNJVTTa4wLxt85AxUf"
      },
      {
            "id": "keycard-lily",
            "label": "Lily",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 44,
                        "y": 62,
                        "w": 313,
                        "h": 448,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 44,
                        "y": 633,
                        "w": 313,
                        "h": 448,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\lily.png",
            "url": "https://lh3.googleusercontent.com/d/1xoEffAEaezhLbKufXBIblYVT9LtZcWBV=s0",
            "drive_file_id": "1xoEffAEaezhLbKufXBIblYVT9LtZcWBV"
      },
      {
            "id": "keycard-loang",
            "label": "Loang",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 49,
                        "y": 178,
                        "w": 305,
                        "h": 357,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 49,
                        "y": 749,
                        "w": 305,
                        "h": 357,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\loang.png",
            "url": "https://lh3.googleusercontent.com/d/19e3g60GBsBmbseVZyL3ARUpcDrDjhiYE=s0",
            "drive_file_id": "19e3g60GBsBmbseVZyL3ARUpcDrDjhiYE"
      },
      {
            "id": "keycard-our-story",
            "label": "Our Story",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 43,
                        "y": 60,
                        "w": 316,
                        "h": 453,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 43,
                        "y": 631,
                        "w": 316,
                        "h": 453,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\our story.png",
            "url": "https://lh3.googleusercontent.com/d/1JDnaMqhUIUN4Hr5XyR1VrYe6sdI86Eox=s0",
            "drive_file_id": "1JDnaMqhUIUN4Hr5XyR1VrYe6sdI86Eox"
      },
      {
            "id": "keycard-red",
            "label": "Red",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 46,
                        "y": 124,
                        "w": 312,
                        "h": 403,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 48,
                        "y": 706,
                        "w": 308,
                        "h": 398,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\red.png",
            "url": "https://lh3.googleusercontent.com/d/16pXBm9L7AoqEh8CFpcaHcY-5ZkVQwBra=s0",
            "drive_file_id": "16pXBm9L7AoqEh8CFpcaHcY-5ZkVQwBra"
      },
      {
            "id": "keycard-vogue",
            "label": "Vogue",
            "kind": "key_card",
            "width": 403,
            "height": 1142,
            "slots": [
                  {
                        "label": "Ảnh 1",
                        "x": 44,
                        "y": 146,
                        "w": 316,
                        "h": 389,
                        "rotate": 0.0,
                        "layer_index": 1
                  },
                  {
                        "label": "Ảnh 2",
                        "x": 43,
                        "y": 717,
                        "w": 316,
                        "h": 387,
                        "rotate": 0.0,
                        "layer_index": 2
                  }
            ],
            "source_path": "C:\c_photobooth\frame\key_card\vogue.png",
            "url": "https://lh3.googleusercontent.com/d/1tLf4nf7gprhEROL8WSGFcwOVbfPWzREO=s0",
            "drive_file_id": "1tLf4nf7gprhEROL8WSGFcwOVbfPWzREO"
      }
];
    var sbFramePresetId = "sb-ms9upnw5";
    var sbPtcardFramePresetId = "ptcard-backdo";
    var sbPagePresetIds = [];
    var sbViewerPackage = '';
    var SB_PACKAGE_RANK = { short: 1, medium: 2, long: 3 };
    var sbDragState = null;
    var sbGesturePointers = {};
    var sbExtraDragState = null;
    var sbExtraGesturePointers = {};
    var sbEditPanelOpen = false;

    function sbNormalizePrintCount(value) {
      var n = parseInt(value, 10);
      if (!isFinite(n) || n <= 0) n = 1;
      return Math.max(1, Math.min(6, n));
    }

    function sbNormalizeExtraCount(value) {
      var n = parseInt(value, 10);
      if (!isFinite(n) || n < 0) n = 0;
      return Math.max(0, Math.min(20, n));
    }

    function sbTotalPages() {
      return Math.max(1, sbNormalizePrintCount(sbPrintCount));
    }

    function sbPresetById(presetId) {
      var presets = sbAvailableFramePresets();
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].id === presetId) return presets[i];
      }
      return null;
    }

    function sbEmbeddedPresetById(presetId) {
      for (var i = 0; i < SB_EMBEDDED_FRAME_PRESETS.length; i++) {
        if (SB_EMBEDDED_FRAME_PRESETS[i].id === presetId) return SB_EMBEDDED_FRAME_PRESETS[i];
      }
      return null;
    }

    function sbNormalizePagePresetIds() {
      var presets = sbAvailableFramePresets();
      var fallback = sbPresetById(sbFramePresetId) || presets[0] || SB_FRAME_PRESETS[0];
      var fallbackId = fallback ? fallback.id : '';
      var totalPages = sbTotalPages();
      for (var i = 0; i < totalPages; i++) {
        if (!sbPresetById(sbPagePresetIds[i])) sbPagePresetIds[i] = fallbackId;
      }
      if (sbPagePresetIds.length > totalPages) sbPagePresetIds.length = totalPages;
      sbFramePresetId = sbPagePresetIds[sbClamp(sbPage, 0, Math.max(0, totalPages - 1))] || fallbackId;
    }

    function sbSlotsPerPage(pageIndex) {
      var preset = sbPreset(typeof pageIndex === 'number' ? pageIndex : sbPage);
      var count = preset && preset.slots && preset.slots.length ? preset.slots.length : SB_DEFAULT_SLOTS_PER_PAGE;
      return Math.max(1, count);
    }

    function sbTotalSlots() {
      var total = 0;
      for (var i = 0; i < sbTotalPages(); i++) total += sbSlotsPerPage(i);
      return Math.max(1, total);
    }

    function sbPageSlotStart(pageIndex) {
      var start = 0;
      for (var i = 0; i < Math.max(0, Number(pageIndex || 0)); i++) start += sbSlotsPerPage(i);
      return start;
    }

    function sbPageForSlotIndex(idx) {
      idx = Math.max(0, Number(idx || 0));
      var start = 0;
      for (var page = 0; page < sbTotalPages(); page++) {
        var count = sbSlotsPerPage(page);
        if (idx < start + count) return page;
        start += count;
      }
      return Math.max(0, sbTotalPages() - 1);
    }

    function sbSlotStateCopy(slot) {
      if (!slot || !slot.src) return null;
      return {
        src: String(slot.src || ''),
        uploadRef: slot.uploadRef || '',
        name: slot.name || '',
        type: slot.type || '',
        size: Number(slot.size || 0),
        source: slot.source || '',
        id: slot.id || '',
        zoom: Number(slot.zoom || 1),
        minZoom: Number(slot.minZoom || 1),
        offsetX: Number(slot.offsetX || 0),
        offsetY: Number(slot.offsetY || 0),
        rotate: Number(slot.rotate || 0),
        flipX: Boolean(slot.flipX),
        autoFit: slot.autoFit !== false,
        imgW: Number(slot.imgW || 0),
        imgH: Number(slot.imgH || 0)
      };
    }

    function sbSnapshotSlotsByPage() {
      var pages = [];
      for (var pageIndex = 0; pageIndex < sbTotalPages(); pageIndex++) {
        var start = sbPageSlotStart(pageIndex);
        var count = sbSlotsPerPage(pageIndex);
        var pageSlots = [];
        for (var slotIndex = 0; slotIndex < count; slotIndex++) {
          pageSlots.push(sbSlotStateCopy(sbSlots[start + slotIndex]));
        }
        pages.push({
          preset: sbPagePresetIds[pageIndex] || sbFramePresetId || '',
          slots: pageSlots
        });
      }
      return pages;
    }

    function sbFlattenPageSlotStates(pageStates) {
      var nextSlots = [];
      for (var pageIndex = 0; pageIndex < sbTotalPages(); pageIndex++) {
        var pageState = pageStates && pageStates[pageIndex];
        var stateSlots = pageState && Array.isArray(pageState.slots) ? pageState.slots : [];
        var count = sbSlotsPerPage(pageIndex);
        for (var slotIndex = 0; slotIndex < count; slotIndex++) {
          nextSlots.push(stateSlots[slotIndex] || null);
        }
      }
      return nextSlots;
    }

    function sbEnsureSlotLength(preserveSlots) {
      var pageStates = preserveSlots === false ? null : sbSnapshotSlotsByPage();
      sbNormalizePagePresetIds();
      var total = sbTotalSlots();
      if (pageStates) {
        sbSlots = sbFlattenPageSlotStates(pageStates);
      } else {
        while (sbSlots.length < total) sbSlots.push(null);
        if (sbSlots.length > total) sbSlots.length = total;
      }
      while (sbSlots.length < total) sbSlots.push(null);
      if (sbSlots.length > total) sbSlots.length = total;
      sbActive = sbClamp(sbActive, 0, Math.max(0, total - 1));
      sbPage = sbClamp(sbPage, 0, Math.max(0, sbTotalPages() - 1));
    }

    function sbPageLabelText() {
      return (sbPage + 1) + '/' + sbTotalPages();
    }

    function sbClamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function sbNormalizeRotation(value) {
      var n = Number(value || 0);
      if (!isFinite(n)) n = 0;
      n = ((n + 180) % 360 + 360) % 360 - 180;
      if (Math.abs(n) < .001) n = 0;
      return n;
    }

    function sbNormalizeSlot(slot) {
      if (!slot) return slot;
      slot.zoom = Math.max(Number(slot.minZoom || 1), Number(slot.zoom || 1));
      slot.offsetX = Number(slot.offsetX || 0);
      slot.offsetY = Number(slot.offsetY || 0);
      slot.rotate = sbNormalizeRotation(slot.rotate);
      slot.flipX = Boolean(slot.flipX);
      return slot;
    }

    function sbMinFillZoom(slot, frameSlot) {
      var iw = Number(slot && (slot.imgW || slot.naturalWidth || 0));
      var ih = Number(slot && (slot.imgH || slot.naturalHeight || 0));
      var slotW = Number(frameSlot && (frameSlot.w || frameSlot.width || 0));
      var slotH = Number(frameSlot && (frameSlot.h || frameSlot.height || 0));
      if (!(iw > 0 && ih > 0 && slotW > 0 && slotH > 0)) return 1;
      var baseScale = Math.max(slotW / iw, slotH / ih);
      var baseW = iw * baseScale;
      var baseH = ih * baseScale;
      var angle = Math.abs(sbNormalizeRotation(slot && slot.rotate || 0)) * Math.PI / 180;
      var c = Math.abs(Math.cos(angle));
      var s = Math.abs(Math.sin(angle));
      var requiredW = slotW * c + slotH * s;
      var requiredH = slotW * s + slotH * c;
      return Math.max(1, requiredW / Math.max(1, baseW), requiredH / Math.max(1, baseH));
    }

    function sbCoverDrawSize(slot, frameSlot) {
      var iw = Number(slot && (slot.imgW || slot.naturalWidth || 0));
      var ih = Number(slot && (slot.imgH || slot.naturalHeight || 0));
      var slotW = Number(frameSlot && (frameSlot.w || frameSlot.width || 0));
      var slotH = Number(frameSlot && (frameSlot.h || frameSlot.height || 0));
      if (!(iw > 0 && ih > 0 && slotW > 0 && slotH > 0)) {
        return { w: slotW || 1, h: slotH || 1 };
      }
      var scale = Math.max(slotW / iw, slotH / ih);
      return { w: iw * scale, h: ih * scale };
    }

    function sbConstrainSlot(slot, frameSlot) {
      if (!slot) return slot;
      slot.minZoom = sbMinFillZoom(slot, frameSlot);
      sbNormalizeSlot(slot);
      var slotW = Number(frameSlot && (frameSlot.w || frameSlot.width || 0));
      var slotH = Number(frameSlot && (frameSlot.h || frameSlot.height || 0));
      var base = sbCoverDrawSize(slot, frameSlot);
      var drawW = base.w * Math.max(1, Number(slot.zoom || 1));
      var drawH = base.h * Math.max(1, Number(slot.zoom || 1));
      var limitX = slotW > 0 ? Math.max(0, ((drawW - slotW) / 2 / slotW) * 100) : 0;
      var limitY = slotH > 0 ? Math.max(0, ((drawH - slotH) / 2 / slotH) * 100) : 0;
      slot.offsetX = sbClamp(slot.offsetX, -limitX, limitX);
      slot.offsetY = sbClamp(slot.offsetY, -limitY, limitY);
      return slot;
    }

    function sbSlotTransform(slot) {
      sbNormalizeSlot(slot);
      var flipX = slot.flipX ? -1 : 1;
      return 'translate(-50%, -50%) rotate(' + sbNormalizeRotation(slot.rotate).toFixed(3) + 'deg) scale(' + (slot.zoom * flipX).toFixed(3) + ',' + slot.zoom.toFixed(3) + ')';
    }

    function sbSlotImageStyle(slot, frameSlot) {
      sbConstrainSlot(slot, frameSlot);
      var iw = Number(slot && (slot.imgW || slot.naturalWidth || 0));
      var ih = Number(slot && (slot.imgH || slot.naturalHeight || 0));
      var slotW = Number(frameSlot && (frameSlot.w || frameSlot.width || 0));
      var slotH = Number(frameSlot && (frameSlot.h || frameSlot.height || 0));
      var imageRatio = iw > 0 && ih > 0 ? iw / ih : 1;
      var slotRatio = slotW > 0 && slotH > 0 ? slotW / slotH : 1;
      var fitSize = imageRatio >= slotRatio
        ? 'height:100%;width:auto;'
        : 'width:100%;height:auto;';
      return 'position:absolute;left:calc(50% + ' + slot.offsetX.toFixed(2) + '%);top:calc(50% + ' + slot.offsetY.toFixed(2) + '%);' + fitSize + 'min-width:100%;min-height:100%;max-width:none;max-height:none;object-fit:cover;display:block;transform-origin:center center;transform:' + sbSlotTransform(slot) + ';';
    }

    function sbUpdateSlotDom(idx) {
      var slot = sbSlots[idx];
      var node = document.querySelector('[data-sb-slot="' + idx + '"] img');
      if (slot && node) {
        node.style.cssText = sbSlotImageStyle(slot, sbFrameSlotForIndex(idx));
      }
      if (idx === sbActive) {
        var zoom = slot ? Math.round(Math.max(Number(slot.minZoom || 1), Number(slot.zoom || 1)) * 100) : 100;
        var range = $('sbZoomRange');
        var label = $('sbZoomValue');
        var rotateRange = $('sbRotateRange');
        var rotateInput = $('sbRotateInput');
        var rotateLabel = $('sbRotateValue');
        if (range) {
          var minZoom = slot ? Math.round(Math.max(1, Number(slot.minZoom || 1)) * 100) : 100;
          range.min = String(minZoom);
          range.max = String(Math.max(250, minZoom + 160));
          range.value = String(zoom);
        }
        if (label) label.textContent = zoom + '%';
        if (rotateRange) rotateRange.value = String(slot ? sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '') : 0);
        if (rotateInput) rotateInput.value = String(slot ? sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '') : 0);
        if (rotateLabel) rotateLabel.textContent = (slot ? sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '') : '0') + '°';
      }
    }

    function sbFrameSlotForIndex(idx) {
      var pageIndex = sbPageForSlotIndex(idx);
      var preset = sbPreset(pageIndex);
      var slotsPerPage = sbSlotsPerPage(pageIndex);
      var slotIndex = Math.max(0, Number(idx || 0)) - sbPageSlotStart(pageIndex);
      var cardW = Number(preset.width || 1200);
      var pageSlots = sbPresetPageSlots(preset, pageIndex, cardW);
      return pageSlots[slotIndex] || sbDefaultPageSlots(cardW)[slotIndex % SB_DEFAULT_SLOTS_PER_PAGE];
    }

    window.sbRememberSlotImageSize = function (idx, imageEl) {
      var slot = sbSlots[idx];
      if (!slot || !imageEl) return;
      var iw = Number(imageEl.naturalWidth || imageEl.width || 0);
      var ih = Number(imageEl.naturalHeight || imageEl.height || 0);
      if (iw > 0 && ih > 0) {
        slot.imgW = iw;
        slot.imgH = ih;
        var frameSlot = sbFrameSlotForIndex(idx);
        slot.minZoom = sbMinFillZoom(slot, frameSlot);
        if (slot.autoFit !== false || Number(slot.zoom || 1) < Number(slot.minZoom || 1)) {
          slot.zoom = Number(slot.minZoom || 1);
          slot.offsetX = 0;
          slot.offsetY = 0;
          slot.autoFit = false;
        }
        sbUpdateSlotDom(idx);
      }
    };

    function sbDefaultPageSlots(cardW) {
      var gap = 28;
      var marginX = 70;
      var top = 90;
      var slotW = (cardW - marginX * 2 - gap) / 2;
      var slotH = 760;
      var slots = [];
      for (var i = 0; i < SB_DEFAULT_SLOTS_PER_PAGE; i++) {
        slots.push({
          x: marginX + (i % 2) * (slotW + gap),
          y: top + Math.floor(i / 2) * (slotH + gap),
          w: slotW,
          h: slotH,
          rotate: 0
        });
      }
      return slots;
    }

    function sbPresetPageSlots(preset, pageIndex, cardW) {
      var slots = (preset && preset.slots && preset.slots.length) ? preset.slots : [];
      if (slots.length) return slots;
      return sbDefaultPageSlots(cardW);
    }

    function sbSlotLayer(slot, index) {
      var value = slot && slot.layer_index;
      return value === undefined || value === null || value === '' || !isFinite(Number(value)) ? index + 1 : Number(value);
    }

    function sbCompareSlotLayers(a, b) {
      return sbSlotLayer(a.frameSlot, a.localSlot) - sbSlotLayer(b.frameSlot, b.localSlot) || a.localSlot - b.localSlot;
    }

    function sbPreset(pageIndex) {
      var presets = sbAvailableFramePresets();
      var page = typeof pageIndex === 'number' ? sbClamp(pageIndex, 0, Math.max(0, sbTotalPages() - 1)) : sbPage;
      var presetId = sbPagePresetIds[page] || sbFramePresetId;
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].id === presetId) return presets[i];
      }
      return presets[0] || SB_FRAME_PRESETS[0];
    }

    function sbNormalizePackage(value) {
      value = String(value || '').toLowerCase();
      if (value === 'medium' || value === 'mid' || value === '2') return 'medium';
      if (value === 'long' || value === 'large' || value === '3') return 'long';
      if (value === 'short' || value === '1') return 'short';
      return '';
    }

    function sbAvailableFramePresets() {
      var packageCode = sbNormalizePackage(sbViewerPackage);
      if (!packageCode) return SB_FRAME_PRESETS.slice();
      var packageRank = SB_PACKAGE_RANK[packageCode] || 1;
      return SB_FRAME_PRESETS.filter(function (item) {
        var tierRank = SB_PACKAGE_RANK[sbNormalizePackage(item.packageTier) || 'short'] || 1;
        return tierRank <= packageRank;
      });
    }

    function sbApplyFramePresetsFromPayload(res) {
      var frameData = (res && (res.selfbooth_frames || res.selfboothFrames || res.default_selfbooth_frames || res.defaultSelfboothFrames)) || (res && res.manifest && (res.manifest.selfbooth_frames || res.manifest.selfboothFrames)) || null;
      if (!frameData || !Array.isArray(frameData.frames) || !frameData.frames.length) return;
      SB_FRAME_PRESETS = frameData.frames.map(function (item) {
        item = item || {};
        var id = String(item.id || '');
        var embedded = sbEmbeddedPresetById(id);
        var payloadSlots = Array.isArray(item.slots) ? item.slots : [];
        var payloadRegions = Array.isArray(item.cardRegions || item.card_regions) ? (item.cardRegions || item.card_regions) : [];
        var embeddedSlots = embedded && Array.isArray(embedded.slots) ? embedded.slots : [];
        var embeddedRegions = embedded && Array.isArray(embedded.cardRegions) ? embedded.cardRegions : [];
        var payloadHasCompleteGeometry = payloadSlots.length && payloadRegions.length;
        if (!payloadHasCompleteGeometry) {
          if (!payloadSlots.length && embeddedSlots.length) payloadSlots = embeddedSlots;
          if (!payloadRegions.length && embeddedRegions.length) payloadRegions = embeddedRegions;
        }
        return {
          id: id,
          label: String(item.label || item.id || 'SelfBooth frame'),
          packageTier: sbNormalizePackage(item.packageTier || item.package_tier) || 'short',
          title: String(item.title || ''),
          signature: String(item.signature || ''),
          footer: String(item.footer || ''),
          width: Number(item.width || 1200),
          height: Number(item.height || 1800),
          slots: payloadSlots,
          cardRegions: payloadRegions,
          bg: item.bg || '#FCFAF5',
          slotBg: item.slotBg || item.slot_background || '#fbf4ef',
          border: item.border || '#DED2BD',
          accent: item.accent || '#536048',
          text: item.text || '#2f241f',
          overlayUrl: item.overlayUrl || item.overlay_url || '',
          overlayOnly: item.overlayOnly !== false
        };
      }).filter(function (item) { return item.id; });
      if (!SB_FRAME_PRESETS.length) return;
      sbFramePresetId = frameData.active || sbFramePresetId || SB_FRAME_PRESETS[0].id;
      sbPagePresetIds = [];
    }

    function sbPtcardEmbeddedPresetById(presetId) {
      for (var i = 0; i < SB_EMBEDDED_PTCARD_FRAME_PRESETS.length; i++) {
        if (SB_EMBEDDED_PTCARD_FRAME_PRESETS[i].id === presetId) return SB_EMBEDDED_PTCARD_FRAME_PRESETS[i];
      }
      return null;
    }

    function sbApplyPtcardPresetsFromPayload(res) {
      var frameData = (res && res.selfbooth_ptcard_frames) || (res && res.manifest && (res.manifest.selfbooth_ptcard_frames || res.manifest.selfboothPtcardFrames));
      if (!frameData || !Array.isArray(frameData.frames)) return;
      SB_PTCARD_FRAME_PRESETS = frameData.frames.map(function (item) {
        item = item || {};
        var id = String(item.id || '');
        var embedded = sbPtcardEmbeddedPresetById(id);
        var payloadSlots = Array.isArray(item.slots) ? item.slots : [];
        if (!payloadSlots.length && embedded && Array.isArray(embedded.slots)) payloadSlots = embedded.slots;
        return {
          id: id,
          kind: String(item.kind || item.type || 'ptcard').toLowerCase() === 'cd' ? 'cd' : 'ptcard',
          label: String(item.label || item.id || 'PT Card'),
          topic: String(item.topic || ''),
          packageTier: sbNormalizePackage(item.packageTier || item.package_tier) || 'medium',
          width: Number(item.width || 2055),
          height: Number(item.height || 1299),
          slots: payloadSlots,
          editableSides: Number(item.editableSides || item.editable_sides || 1),
          backSlots: item.backSlots || item.back_slots || [],
          frontUrl: item.frontUrl || item.front_url || '',
          backUrl: item.backUrl || item.back_url || ''
        };
      }).filter(function (item) { return item.id && item.frontUrl; });
      if (!SB_PTCARD_FRAME_PRESETS.length) return;
      sbPtcardFramePresetId = frameData.active || sbPtcardFramePresetId || SB_PTCARD_FRAME_PRESETS[0].id;
    }

    function sbAvailablePtcardPresets(kind) {
      kind = String(kind || 'ptcard').toLowerCase() === 'cd' ? 'cd' : 'ptcard';
      var packageCode = sbNormalizePackage(sbViewerPackage);
      var kindPresets = SB_PTCARD_FRAME_PRESETS.filter(function (item) {
        var itemKind = String(item.kind || item.type || 'ptcard').toLowerCase() === 'cd' ? 'cd' : 'ptcard';
        return itemKind === kind;
      });
      if (!packageCode) return kindPresets.slice();
      var packageRank = SB_PACKAGE_RANK[packageCode] || 1;
      return kindPresets.filter(function (item) {
        var tierRank = SB_PACKAGE_RANK[sbNormalizePackage(item.packageTier) || 'medium'] || 2;
        return tierRank <= packageRank;
      });
    }

    function sbPtcardPresetById(presetId, kind) {
      var presets = sbAvailablePtcardPresets(kind || 'ptcard');
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].id === presetId) return presets[i];
      }
      return null;
    }

    function sbPtcardPresetForCard(cardIndex, kind) {
      var card = sbPtcardCards[cardIndex] || {};
      return sbPtcardPresetById(card.presetId || sbPtcardFramePresetId, kind || 'ptcard') || sbAvailablePtcardPresets(kind || 'ptcard')[0] || null;
    }

    function sbPtcardFrameSlot(preset, side, index) {
      var cardW = Number(preset && preset.width || 2055);
      var cardH = Number(preset && preset.height || 1299);
      side = side || ((preset && preset.kind === 'cd') ? 'front' : sbPtcardActiveSide);
      index = typeof index === 'number' ? index : ((preset && preset.kind === 'cd') ? 0 : sbPtcardActiveSlot);
      var slots = side === 'back' ? preset && preset.backSlots : preset && preset.slots;
      return (Array.isArray(slots) && slots[index]) || { x: Math.round(cardW * .055), y: Math.round(cardH * .085), w: Math.round(cardW * .89), h: Math.round(cardH * .83), rotate: 0 };
    }

    function sbPtcardSideSlots(preset, side) {
      var slots = side === 'back' ? preset && preset.backSlots : preset && preset.slots;
      return Array.isArray(slots) && slots.length ? slots : [sbPtcardFrameSlot(preset, side, 0)];
    }

    function sbPtcardMakeCard(card, presetId) {
      var front = (card.frontSlots || [card.slot || null]).map(sbSlotStateCopy);
      var back = (card.backSlots || []).map(sbSlotStateCopy);
      var result = { presetId: presetId, frontSlots: front, backSlots: back };
      Object.defineProperty(result, 'slot', {
        get: function () { return (sbPtcardActiveSide === 'back' ? this.backSlots : this.frontSlots)[sbPtcardActiveSlot] || null; },
        set: function (value) { (sbPtcardActiveSide === 'back' ? this.backSlots : this.frontSlots)[sbPtcardActiveSlot] = value; }
      });
      return result;
    }

    function sbPtcardHasImages(card, preset) {
      if (!card || !preset) return false;
      var front = sbPtcardSideSlots(preset, 'front').some(function (_, i) { return card.frontSlots[i] && card.frontSlots[i].src; });
      var back = Number(preset.editableSides || 1) === 2 && sbPtcardSideSlots(preset, 'back').some(function (_, i) { return card.backSlots[i] && card.backSlots[i].src; });
      return Boolean(front || back);
    }

    function sbNormalizePtcardCards() {
      var total = Math.max(0, sbNormalizeExtraCount(sbPackageExtras.photocards || 0));
      var allowed = sbAvailablePtcardPresets('ptcard');
      var fallback = allowed[0] || null;
      var fallbackId = sbPtcardFramePresetId || (fallback && fallback.id) || '';
      var next = [];
      for (var i = 0; i < total; i++) {
        var card = sbPtcardCards[i] || {};
        var presetId = sbPtcardPresetById(card.presetId, 'ptcard') ? card.presetId : fallbackId;
        next.push(sbPtcardMakeCard(card, presetId));
      }
      sbPtcardCards = next;
      sbPtcardActive = sbClamp(sbPtcardActive, 0, Math.max(0, total - 1));
    }

    function sbPtcardImageStyle(cardIndex) {
      var card = sbPtcardCards[cardIndex] || {};
      var slot = card.slot;
      var preset = sbPtcardPresetForCard(cardIndex);
      if (!slot || !preset) return '';
      return sbSlotImageStyle(slot, sbPtcardFrameSlot(preset));
    }

    function sbExtraInfoButton(kind) {
      var label = kind === 'cd' ? 'Thông tin ghép CD' : 'Thông tin ghép PT Card';
      return '<button type="button" class="sb-info-btn" onclick="sbShowExtraComposerInfo(\'' + kind + '\')" aria-label="' + escAttr(label) + '" title="' + escAttr(label) + '">i</button>';
    }

    function sbExtraSlotToolPanel(kind) {
      kind = kind === 'cd' ? 'cd' : 'ptcard';
      var isCd = kind === 'cd';
      var index = isCd ? sbCdActive : sbPtcardActive;
      var total = isCd ? sbCdCards.length : sbPtcardCards.length;
      var item = (isCd ? sbCdCards[index] : sbPtcardCards[index]) || {};
      var slot = item.slot;
      var label = isCd ? 'CD ' + (index + 1) : 'card ' + (index + 1) + ' · ' + (sbPtcardActiveSide === 'back' ? 'mặt sau' : 'mặt trước') + ' · slot ' + (sbPtcardActiveSlot + 1);
      if (!slot || !slot.src) {
        return '<div class="sb-extra-empty-tools"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><span>Bấm dấu + trên ' + esc(label) + ' để chọn ảnh từ máy/điện thoại. Ảnh sẽ tự fit vào slot, sau đó có thể kéo và zoom giống frame chính.</span>' + sbExtraInfoButton(kind) + '</div></div>';
      }
      var zoom = Math.round(Math.max(1, Number(slot.zoom || 1)) * 100);
      var rangeId = isCd ? 'sbCdZoomRange' : 'sbPtcardZoomRange';
      var valueId = isCd ? 'sbCdZoomValue' : 'sbPtcardZoomValue';
      var upload = isCd ? 'sbUploadCd(' + index + ')' : 'sbUploadPtcard(' + index + ')';
      var flip = isCd ? 'sbFlipCd(' + index + ')' : 'sbFlipPtcard(' + index + ')';
      var clear = isCd ? 'sbClearCd(' + index + ')' : 'sbClearPtcard(' + index + ')';
      var setZoom = isCd ? 'sbSetCdZoom(this.value)' : 'sbSetPtcardZoom(this.value)';
      var setRotate = isCd ? 'sbSetCdRotate(this.value)' : 'sbSetPtcardRotate(this.value)';
      var bumpLeft = isCd ? 'sbBumpCdRotate(-1)' : 'sbBumpPtcardRotate(-1)';
      var bumpRight = isCd ? 'sbBumpCdRotate(1)' : 'sbBumpPtcardRotate(1)';
      var preview = isCd ? 'sbPreviewCd()' : 'sbPreviewPtcard()';
      var previewLabel = isCd ? 'Xem trước CD' : 'Xem trước PT Card';
      var previewNote = isCd ? 'một mặt đĩa' : 'mặt trước và mặt sau';
      var minZoom = Math.round(Math.max(1, Number(slot.minZoom || 1)) * 100);
      var rotate = sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '');
      var h = '<div class="sb-extra-active-tools">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><strong class="sb-extra-active-label">Chỉnh ảnh trong ' + esc(label) + ' / ' + total + '</strong>' + sbExtraInfoButton(kind) + '</div>';
      h += '<div class="sb-extra-tool-grid">';
      h += '<span style="font-size:.82rem;color:#536048;font-weight:900">Zoom</span>';
      h += '<input id="' + rangeId + '" oninput="' + setZoom + '" type="range" min="' + minZoom + '" max="' + Math.max(260, minZoom + 160) + '" value="' + zoom + '" style="width:100%;accent-color:#536048">';
      h += '<strong id="' + valueId + '" style="font-size:.78rem;color:#766E60;min-width:42px;text-align:center">' + zoom + '%</strong>';
      h += '<button class="sb-extra-panel-btn" onclick="' + upload + '"><span aria-hidden="true">&#8679;</span><span>Đổi ảnh</span></button>';
      h += '<button class="sb-extra-panel-btn" onclick="' + flip + '"><span aria-hidden="true">&#8646;</span><span>Lật</span></button>';
      h += '<button class="sb-extra-panel-btn danger" onclick="' + clear + '"><span aria-hidden="true">&#10005;</span><span>Xóa</span></button>';
      h += '</div>';
      h += '<div class="sb-rotate-slider-grid">';
      h += '<span style="font-size:.82rem;color:#536048;font-weight:900">Xoay</span>';
      h += '<input id="' + (isCd ? 'sbCdRotateRange' : 'sbPtcardRotateRange') + '" oninput="' + setRotate + '" type="range" min="-180" max="180" step="1" value="' + rotate + '" style="width:100%;accent-color:#536048">';
      h += '<strong id="' + (isCd ? 'sbCdRotateValue' : 'sbPtcardRotateValue') + '" style="font-size:.78rem;color:#766E60;min-width:42px;text-align:center">' + rotate + '°</strong>';
      h += '</div>';
      h += '<div class="sb-rotate-detail-grid">';
      h += '<span style="font-size:.82rem;color:#536048;font-weight:900">Độ</span>';
      h += '<input class="sb-rotate-number" id="' + (isCd ? 'sbCdRotateInput' : 'sbPtcardRotateInput') + '" oninput="' + setRotate + '" type="number" min="-180" max="180" step="0.1" value="' + rotate + '">';
      h += '<button class="sb-extra-panel-btn" onclick="' + bumpLeft + '"><span aria-hidden="true">↶</span><span>-1°</span></button>';
      h += '<button class="sb-extra-panel-btn" onclick="' + bumpRight + '"><span aria-hidden="true">↷</span><span>+1°</span></button>';
      h += '</div>';
      h += '<button class="sb-extra-preview-btn" onclick="' + preview + '">' + esc(previewLabel) + ' - ' + esc(previewNote) + '</button>';
      h += '</div>';
      return h;
    }

    function sbExtraPresetScrollValue(kind, value) {
      if (kind === 'cd') {
        if (typeof value === 'number') sbCdPresetScrollLeft = value;
        return sbCdPresetScrollLeft;
      }
      if (typeof value === 'number') sbPtcardPresetScrollLeft = value;
      return sbPtcardPresetScrollLeft;
    }

    function sbExtraPresetStrip(kind, wrap) {
      if (!wrap || !wrap.querySelector) return null;
      kind = kind === 'cd' ? 'cd' : 'ptcard';
      return wrap.querySelector('[data-sb-extra-preset-strip="' + kind + '"]');
    }

    function sbRememberExtraPresetScroll(kind, wrap) {
      var strip = sbExtraPresetStrip(kind, wrap);
      if (strip) sbExtraPresetScrollValue(kind, Number(strip.scrollLeft || 0));
    }

    function sbRestoreExtraPresetScroll(kind, wrap) {
      var strip = sbExtraPresetStrip(kind, wrap);
      if (!strip) return;
      var left = sbExtraPresetScrollValue(kind);
      strip.scrollLeft = left;
      strip.onscroll = function () {
        sbExtraPresetScrollValue(kind, Number(strip.scrollLeft || 0));
      };
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          strip.scrollLeft = sbExtraPresetScrollValue(kind);
        });
      }
    }

    function sbPtcardPreviewHtml(cardIndex) {
      var card = sbPtcardCards[cardIndex] || {};
      var preset = sbPtcardPresetForCard(cardIndex);
      if (!preset) return '';
      var cardW = Number(preset.width || 2055);
      var cardH = Number(preset.height || 1299);
      var active = cardIndex === sbPtcardActive;
      var h = '<div class="sb-ptcard-tile' + (active ? ' is-active' : '') + '" onclick="sbSelectPtcard(' + cardIndex + ')">';
      h += '<div class="sb-small-card-edit-head"><span>PT Card ' + (cardIndex + 1) + '</span></div>';
      h += '<div class="sb-ptcard-side-grid">';
      ['front', 'back'].forEach(function (side) {
        var editable = side === 'front' || Number(preset.editableSides || 1) === 2;
        var states = side === 'front' ? card.frontSlots : card.backSlots;
        var frameUrl = side === 'front' ? preset.frontUrl : preset.backUrl;
        h += '<div><span class="sb-ptcard-side-title">' + (side === 'front' ? 'Mặt trước' : 'Mặt sau') + '</span>';
        h += '<div class="sb-ptcard-canvas" onclick="event.stopPropagation();sbSelectPtcardSide(' + cardIndex + ',\'' + (editable ? side : 'front') + '\',0)" style="aspect-ratio:' + cardW + '/' + cardH + '">';
        if (editable) {
          var regions = sbPtcardSideSlots(preset, side);
          regions.map(function (frameSlot, index) { return { frameSlot: frameSlot, localSlot: index }; }).sort(sbCompareSlotLayers).forEach(function (entry, position) {
            var frameSlot = entry.frameSlot, index = entry.localSlot, slot = states[index];
            var geom = 'left:' + (Number(frameSlot.x || 0) / cardW * 100) + '%;top:' + (Number(frameSlot.y || 0) / cardH * 100) + '%;width:' + (Number(frameSlot.w || 1) / cardW * 100) + '%;height:' + (Number(frameSlot.h || 1) / cardH * 100) + '%;transform:rotate(' + Number(frameSlot.rotate || 0) + 'deg);z-index:' + (position + 1);
            if (active && sbPtcardActiveSide === side && sbPtcardActiveSlot === index) geom += ';outline:3px solid #899979;outline-offset:-3px';
            var handler = 'sbPtcardSlotPointer(event,' + cardIndex + ',\'' + side + '\',' + index + ')';
            h += '<div class="sb-ptcard-slot' + (slot && slot.src ? ' is-draggable' : '') + '" onpointerdown="' + handler + '" style="' + geom + '">';
            if (slot && slot.src) h += '<img data-sb-extra-image="ptcard-' + cardIndex + '-' + side + '-' + index + '" src="' + escAttr(slot.src) + '" alt="" draggable="false" onload="sbRememberPtcardImageSizeAt(' + cardIndex + ',\'' + side + '\',' + index + ',this)" style="' + sbSlotImageStyle(slot, frameSlot) + '">';
            else h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#766E60;font-size:2rem;font-weight:900">+</div>';
            h += '</div>';
          });
        }
        if (frameUrl) h += '<img src="' + escAttr(frameUrl) + '" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;z-index:100">';
        h += '</div>';
        if (editable) h += '<div>' + sbPtcardSideSlots(preset, side).map(function (_, index) { return '<button type="button" onclick="event.stopPropagation();sbChoosePtcardSlot(' + cardIndex + ',\'' + side + '\',' + index + ')">Slot ' + (index + 1) + '</button>'; }).join(' ') + '</div>';
        h += '</div>';
      });
      h += '</div></div>';
      return h;
    }

    function sbPtcardPresetButtonsHtml(cardIndex) {
      var card = sbPtcardCards[cardIndex] || {};
      var presets = sbAvailablePtcardPresets();
      if (!presets.length) return '<div class="sb-note">Chưa có frame PT Card cho gói này.</div>';
      return '<div class="sb-frame-choice-strip" data-sb-extra-preset-strip="ptcard">' + presets.map(function (item) {
        var active = item.id === (card.presetId || sbPtcardFramePresetId);
        return '<button onclick="sbSetPtcardPreset(' + cardIndex + ',\'' + escAttr(item.id) + '\')" class="sb-frame-choice' + (active ? ' is-active' : '') + '"><div class="sb-frame-choice-preview" style="aspect-ratio:' + Number(item.width || 2055) + '/' + Number(item.height || 1299) + '">' + (item.frontUrl ? '<img src="' + escAttr(item.frontUrl) + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none">' : '') + '</div><div style="font-size:.72rem;line-height:1.25;white-space:normal">' + esc(item.label || 'PT Card') + '</div></button>';
      }).join('') + '</div>';
    }

    function sbPtcardComposerHtml() {
      sbNormalizePtcardCards();
      var total = sbPtcardCards.length;
      if (!total) return '';
      if (!sbAvailablePtcardPresets().length) {
        return '<div class="sb-extra-upload"><div class="sb-extra-upload-head"><div><strong style="color:#4D493F;font-size:.86rem">PT Card - photocard bo góc</strong><div class="sb-note" style="margin:2px 0 0">Gói này có photocard nhưng chưa có frame phù hợp. Vui lòng báo thu ngân kiểm tra.</div></div></div></div>';
      }
      var selected = sbPtcardCards.filter(function (item, index) { return sbPtcardHasImages(item, sbPtcardPresetForCard(index)); }).length;
      var h = '<div class="sb-extra-upload sb-ptcard-wrap">';
      h += '<div class="sb-extra-upload-head"><div><strong style="color:#4D493F;font-size:.86rem">PT Card - photocard bo góc</strong><div class="sb-note" style="margin:2px 0 0">Slot card ' + (sbPtcardActive + 1) + '/' + total + '. Bấm dấu + để chọn ảnh từ máy, kéo ảnh để căn giống frame chính.</div></div><strong style="color:#536048">' + selected + '/' + total + '</strong></div>';
      h += '<div class="sb-ptcard-grid">' + sbPtcardCards.map(function (_, index) { return sbPtcardPreviewHtml(index); }).join('') + '</div>';
      h += '<div style="margin-top:12px"><strong style="color:#536048;font-size:.76rem">Mẫu cho PT Card ' + (sbPtcardActive + 1) + '</strong>' + sbPtcardPresetButtonsHtml(sbPtcardActive) + '</div>';
      h += sbExtraSlotToolPanel('ptcard');
      if (sbPtcardPreviewCards.length) {
        h += '<div style="margin-top:12px"><strong style="color:#536048;font-size:.76rem">Xem lại file PT Card</strong><div class="sb-card-preview-grid sb-extra-result-grid">';
        sbPtcardPreviewCards.forEach(function (card, idx) {
          h += '<a class="sb-card-preview-item" href="' + escAttr(card.previewUrl || card.dataUrl) + '" data-fancybox="sb-ptcard-preview" data-caption="' + escAttr(card.name || ('PT Card ' + (idx + 1))) + '"><img src="' + escAttr(card.previewUrl || card.dataUrl) + '" alt=""></a>';
        });
        h += '</div></div>';
      }
      h += '</div>';
      return h;
    }

    function sbRenderPtcardComposer() {
      var wrap = $('sbPtcardComposerWrap');
      if (!wrap) return;
      sbRememberExtraPresetScroll('ptcard', wrap);
      wrap.innerHTML = sbPtcardComposerHtml();
      sbNormalizeButtons(wrap);
      sbRestoreExtraPresetScroll('ptcard', wrap);
      sbInitFancybox();
    }

    function sbCdPresetById(presetId) {
      return sbPtcardPresetById(presetId, 'cd');
    }

    function sbCdPresetForDisc(discIndex) {
      var disc = sbCdCards[discIndex] || {};
      return sbCdPresetById(disc.presetId || sbPtcardFramePresetId) || sbAvailablePtcardPresets('cd')[0] || null;
    }

    function sbNormalizeCdCards() {
      var total = Math.max(0, sbNormalizeExtraCount(sbPackageExtras.cds || 0));
      var allowed = sbAvailablePtcardPresets('cd');
      var fallback = allowed[0] || null;
      var fallbackId = (fallback && fallback.id) || '';
      var next = [];
      for (var i = 0; i < total; i++) {
        var disc = sbCdCards[i] || {};
        var presetId = sbCdPresetById(disc.presetId) ? disc.presetId : fallbackId;
        next.push({ presetId: presetId, slot: sbSlotStateCopy(disc.slot) });
      }
      sbCdCards = next;
      sbCdActive = sbClamp(sbCdActive, 0, Math.max(0, total - 1));
    }

    function sbCdImageStyle(discIndex) {
      var disc = sbCdCards[discIndex] || {};
      var slot = disc.slot;
      var preset = sbCdPresetForDisc(discIndex);
      if (!slot || !preset) return '';
      return sbSlotImageStyle(slot, sbPtcardFrameSlot(preset));
    }

    function sbCdPreviewHtml(discIndex) {
      var disc = sbCdCards[discIndex] || {};
      var preset = sbCdPresetForDisc(discIndex);
      if (!preset) return '';
      var cardW = Number(preset.width || 1417);
      var cardH = Number(preset.height || 1417);
      var active = discIndex === sbCdActive;
      var hasImage = !!(disc.slot && disc.slot.src);
      var dragAttr = hasImage ? ' is-draggable" onpointerdown="sbStartExtraFrameDrag(event,\'cd\',' + discIndex + ')"' : '"';
      var imgHtml = hasImage
        ? '<img data-sb-extra-image="cd-' + discIndex + '" src="' + escAttr(disc.slot.src) + '" alt="" draggable="false" onload="sbRememberCdImageSize(' + discIndex + ',this)" style="' + sbCdImageStyle(discIndex) + '">'
        : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#766E60;font-size:2rem;font-weight:900">+</div>';
      var frameSlot = sbPtcardFrameSlot(preset);
      var left = (Number(frameSlot.x || 0) / cardW) * 100;
      var top = (Number(frameSlot.y || 0) / cardH) * 100;
      var width = (Number(frameSlot.w || frameSlot.width || 1) / cardW) * 100;
      var height = (Number(frameSlot.h || frameSlot.height || 1) / cardH) * 100;
      var rotate = Number(frameSlot.rotate || 0);
      var h = '<div class="sb-ptcard-tile' + (active ? ' is-active' : '') + '" onclick="sbSelectCd(' + discIndex + ')">';
      h += '<div class="sb-small-card-edit-head"><span>Slot CD ' + (discIndex + 1) + '</span><span>' + (hasImage ? 'Đã chọn' : 'Trống') + '</span></div>';
      h += '<button class="sb-ptcard-canvas" onclick="event.stopPropagation();' + (hasImage ? 'sbSelectCd(' + discIndex + ')' : 'sbUploadCd(' + discIndex + ')') + '" style="aspect-ratio:' + cardW + '/' + cardH + ';border-radius:999px">';
      h += '<div data-sb-extra-slot="cd-' + discIndex + '" class="sb-ptcard-slot' + dragAttr + ' style="left:' + left.toFixed(4) + '%;top:' + top.toFixed(4) + '%;width:' + width.toFixed(4) + '%;height:' + height.toFixed(4) + '%;transform:rotate(' + rotate.toFixed(3) + 'deg);border-radius:999px">' + imgHtml + '</div>';
      h += '<img src="' + escAttr(preset.frontUrl) + '" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:999px">';
      h += '</button><div class="sb-note" style="margin-top:5px;text-align:center">Đĩa CD/DVD 120 mm</div></div>';
      return h;
    }

    function sbCdPresetButtonsHtml(discIndex) {
      var disc = sbCdCards[discIndex] || {};
      var presets = sbAvailablePtcardPresets('cd');
      if (!presets.length) return '<div class="sb-note">Chưa có frame CD cho gói này.</div>';
      return '<div class="sb-frame-choice-strip" data-sb-extra-preset-strip="cd">' + presets.map(function (item) {
        var active = item.id === (disc.presetId || (sbCdPresetForDisc(discIndex) || {}).id || '');
        return '<button onclick="sbSetCdPreset(' + discIndex + ',\'' + escAttr(item.id) + '\')" class="sb-frame-choice' + (active ? ' is-active' : '') + '"><div class="sb-frame-choice-preview" style="aspect-ratio:' + Number(item.width || 1417) + '/' + Number(item.height || 1417) + ';border-radius:999px">' + (item.frontUrl ? '<img src="' + escAttr(item.frontUrl) + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:999px">' : '') + '</div><div style="font-size:.72rem;line-height:1.25;white-space:normal">' + esc(item.label || 'CD') + '</div></button>';
      }).join('') + '</div>';
    }

    function sbCdComposerHtml() {
      sbNormalizeCdCards();
      var total = sbCdCards.length;
      if (!total) return '';
      if (!sbAvailablePtcardPresets('cd').length) {
        return '';
      }
      var selected = sbCdCards.filter(function (item) { return item && item.slot && item.slot.src; }).length;
      var h = '<div class="sb-extra-upload sb-ptcard-wrap">';
      h += '<div class="sb-extra-upload-head"><div><strong style="color:#4D493F;font-size:.86rem">CD/DVD 120 mm</strong><div class="sb-note" style="margin:2px 0 0">Slot CD ' + (sbCdActive + 1) + '/' + total + '. Bấm dấu + để chọn ảnh từ máy, kéo ảnh để căn giống frame chính.</div></div><strong style="color:#536048">' + selected + '/' + total + '</strong></div>';
      h += '<div class="sb-ptcard-grid">' + sbCdCards.map(function (_, index) { return sbCdPreviewHtml(index); }).join('') + '</div>';
      h += '<div style="margin-top:12px"><strong style="color:#536048;font-size:.76rem">Mẫu cho CD ' + (sbCdActive + 1) + '</strong>' + sbCdPresetButtonsHtml(sbCdActive) + '</div>';
      h += sbExtraSlotToolPanel('cd');
      if (sbCdPreviewCards.length) {
        h += '<div style="margin-top:12px"><strong style="color:#536048;font-size:.76rem">Xem lại file CD</strong><div class="sb-card-preview-grid sb-extra-result-grid is-cd">';
        sbCdPreviewCards.forEach(function (card, idx) {
          h += '<a class="sb-card-preview-item" href="' + escAttr(card.previewUrl || card.dataUrl) + '" data-fancybox="sb-cd-preview" data-caption="' + escAttr(card.name || ('CD ' + (idx + 1))) + '"><img src="' + escAttr(card.previewUrl || card.dataUrl) + '" alt=""></a>';
        });
        h += '</div></div>';
      }
      h += '</div>';
      return h;
    }

    function sbRenderCdComposer() {
      var wrap = $('sbCdComposerWrap');
      if (!wrap) return;
      sbRememberExtraPresetScroll('cd', wrap);
      wrap.innerHTML = sbCdComposerHtml();
      sbNormalizeButtons(wrap);
      sbRestoreExtraPresetScroll('cd', wrap);
      sbInitFancybox();
    }

    window.sbSelectCd = function (discIndex) {
      sbCdActive = sbClamp(Number(discIndex || 0), 0, Math.max(0, sbCdCards.length - 1));
      sbRenderCdComposer();
    };

    window.sbSetCdPreset = function (discIndex, presetId) {
      if (!sbRequireEditOpen()) return;
      discIndex = sbClamp(Number(discIndex || 0), 0, Math.max(0, sbCdCards.length - 1));
      var preset = sbCdPresetById(presetId) || sbAvailablePtcardPresets('cd')[0];
      if (!preset) return;
      sbCdCards[discIndex] = sbCdCards[discIndex] || {};
      sbCdCards[discIndex].presetId = preset.id;
      if (sbCdCards[discIndex].slot) sbConstrainSlot(sbCdCards[discIndex].slot, sbPtcardFrameSlot(preset));
      sbCdPreviewCards = [];
      sbCdPreviewSignature = '';
      sbRenderCdComposer();
    };

    window.sbUploadCd = function (discIndex) {
      if (!sbRequireEditOpen()) return;
      sbCdUploadTarget = sbClamp(Number(discIndex || 0), 0, Math.max(0, sbCdCards.length - 1));
      sbCdActive = sbCdUploadTarget;
      var input = $('sbCdUploadInput');
      if (input) input.click();
    };

    window.sbPickDriveToCd = function (imageIdx, discIndex) {
      if (!sbRequireEditOpen()) return;
      var f = sbImages[imageIdx];
      if (!f) return;
      var src = f.originalImageUrl || f.previewUrl || f.viewUrl || f.thumbnailUrl;
      if (!src) return;
      discIndex = sbClamp(Number(discIndex || 0), 0, Math.max(0, sbCdCards.length - 1));
      var preset = sbCdPresetForDisc(discIndex);
      sbCdCards[discIndex] = sbCdCards[discIndex] || {};
      sbCdCards[discIndex].slot = { src: src, source: 'drive', id: f.id || '', name: f.name || ('cd_' + (discIndex + 1) + '.jpg'), zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, flipX: false, autoFit: true };
      sbConstrainSlot(sbCdCards[discIndex].slot, sbPtcardFrameSlot(preset));
      sbCdActive = discIndex;
      sbCdPreviewCards = [];
      sbCdPreviewSignature = '';
      sbRenderCdComposer();
    };

    window.sbRememberCdImageSize = function (discIndex, imageEl) {
      var disc = sbCdCards[discIndex] || {};
      var slot = disc.slot;
      if (!slot || !imageEl) return;
      var iw = Number(imageEl.naturalWidth || imageEl.width || 0);
      var ih = Number(imageEl.naturalHeight || imageEl.height || 0);
      if (iw > 0 && ih > 0) {
        slot.imgW = iw;
        slot.imgH = ih;
        var preset = sbCdPresetForDisc(discIndex);
        slot.minZoom = sbMinFillZoom(slot, sbPtcardFrameSlot(preset));
        if (slot.autoFit !== false || Number(slot.zoom || 1) < Number(slot.minZoom || 1)) {
          slot.zoom = Number(slot.minZoom || 1);
          slot.offsetX = 0;
          slot.offsetY = 0;
          slot.autoFit = false;
        }
        sbConstrainSlot(slot, sbPtcardFrameSlot(preset));
        sbUpdateExtraSlotDom('cd', discIndex);
      }
    };

    window.sbSetCdZoom = function (value) {
      var disc = sbCdCards[sbCdActive] || {};
      if (!disc.slot) return;
      disc.slot.autoFit = false;
      disc.slot.zoom = Math.max(Number(disc.slot.minZoom || 1), Number(value || 100) / 100);
      sbConstrainSlot(disc.slot, sbPtcardFrameSlot(sbCdPresetForDisc(sbCdActive)));
      sbInvalidateExtraPreview('cd');
      sbUpdateExtraSlotDom('cd', sbCdActive);
    };

    window.sbSetCdRotate = function (value) {
      var disc = sbCdCards[sbCdActive] || {};
      if (!disc.slot) return;
      disc.slot.autoFit = false;
      disc.slot.rotate = sbNormalizeRotation(value);
      sbConstrainSlot(disc.slot, sbPtcardFrameSlot(sbCdPresetForDisc(sbCdActive)));
      sbInvalidateExtraPreview('cd');
      sbUpdateExtraSlotDom('cd', sbCdActive);
    };

    window.sbBumpCdRotate = function (delta) {
      var disc = sbCdCards[sbCdActive] || {};
      window.sbSetCdRotate(Number(disc.slot && disc.slot.rotate || 0) + Number(delta || 0));
    };

    window.sbMoveCd = function (dx, dy) {
      var disc = sbCdCards[sbCdActive] || {};
      if (!disc.slot) return;
      disc.slot.autoFit = false;
      disc.slot.offsetX = Number(disc.slot.offsetX || 0) + Number(dx || 0);
      disc.slot.offsetY = Number(disc.slot.offsetY || 0) + Number(dy || 0);
      sbConstrainSlot(disc.slot, sbPtcardFrameSlot(sbCdPresetForDisc(sbCdActive)));
      sbInvalidateExtraPreview('cd');
      sbUpdateExtraSlotDom('cd', sbCdActive);
    };

    window.sbFlipCd = function (discIndex) {
      if (!sbRequireEditOpen()) return;
      discIndex = sbClamp(Number(discIndex || 0), 0, Math.max(0, sbCdCards.length - 1));
      var disc = sbCdCards[discIndex] || {};
      if (!disc.slot) return;
      disc.slot.flipX = !disc.slot.flipX;
      sbInvalidateExtraPreview('cd');
      sbUpdateExtraSlotDom('cd', discIndex);
    };

    window.sbClearCd = function (discIndex) {
      if (!sbRequireEditOpen()) return;
      discIndex = sbClamp(Number(discIndex || 0), 0, Math.max(0, sbCdCards.length - 1));
      if (sbCdCards[discIndex]) sbCdCards[discIndex].slot = null;
      sbCdPreviewCards = [];
      sbCdPreviewSignature = '';
      sbRenderCdComposer();
    };

    window.sbPreviewCd = function () {
      if (!sbRequireEditOpen()) return;
      renderSbCdDataUrls({ allowMissing: true }).catch(function (err) {
        window.alert((err && err.message) || 'Chưa tạo được preview CD.');
      });
    };

    window.sbSelectPtcard = function (cardIndex) {
      sbPtcardActive = sbClamp(Number(cardIndex || 0), 0, Math.max(0, sbPtcardCards.length - 1));
      var preset = sbPtcardPresetForCard(sbPtcardActive);
      if (sbPtcardActiveSide === 'back' && Number(preset && preset.editableSides || 1) !== 2) sbPtcardActiveSide = 'front';
      sbPtcardActiveSlot = Math.min(sbPtcardActiveSlot, sbPtcardSideSlots(preset, sbPtcardActiveSide).length - 1);
      sbRenderPtcardComposer();
    };

    window.sbSelectPtcardSide = function (cardIndex, side, slotIndex) {
      sbPtcardActive = sbClamp(Number(cardIndex || 0), 0, Math.max(0, sbPtcardCards.length - 1));
      sbPtcardActiveSide = side === 'back' ? 'back' : 'front';
      sbPtcardActiveSlot = Math.max(0, Number(slotIndex || 0));
      sbRenderPtcardComposer();
    };

    window.sbChoosePtcardSlot = function (cardIndex, side, slotIndex) {
      sbPtcardActive = cardIndex;
      sbPtcardActiveSide = side;
      sbPtcardActiveSlot = slotIndex;
      var card = sbPtcardCards[cardIndex];
      if (card && card.slot && card.slot.src) sbRenderPtcardComposer();
      else sbUploadPtcard(cardIndex);
    };

    window.sbPtcardSlotPointer = function (event, cardIndex, side, slotIndex) {
      if (sbIsEditExpired()) return;
      sbPtcardActive = cardIndex;
      sbPtcardActiveSide = side;
      sbPtcardActiveSlot = slotIndex;
      var card = sbPtcardCards[cardIndex];
      if (card && card.slot && card.slot.src) {
        sbStartExtraFrameDrag(event, 'ptcard', cardIndex);
      } else {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        sbUploadPtcard(cardIndex);
      }
    };

    window.sbRememberPtcardImageSizeAt = function (cardIndex, side, slotIndex, imageEl) {
      var card = sbPtcardCards[cardIndex];
      var slot = card && (side === 'back' ? card.backSlots : card.frontSlots)[slotIndex];
      if (!slot || !imageEl || !imageEl.naturalWidth || !imageEl.naturalHeight) return;
      slot.imgW = imageEl.naturalWidth; slot.imgH = imageEl.naturalHeight;
      var region = sbPtcardFrameSlot(sbPtcardPresetForCard(cardIndex), side, slotIndex);
      slot.minZoom = sbMinFillZoom(slot, region);
      if (slot.autoFit !== false || Number(slot.zoom || 1) < slot.minZoom) {
        slot.zoom = slot.minZoom; slot.offsetX = 0; slot.offsetY = 0; slot.autoFit = false;
      }
      sbConstrainSlot(slot, region);
      imageEl.style.cssText = sbSlotImageStyle(slot, region);
    };

    window.sbSetPtcardPreset = function (cardIndex, presetId) {
      if (!sbRequireEditOpen()) return;
      cardIndex = sbClamp(Number(cardIndex || 0), 0, Math.max(0, sbPtcardCards.length - 1));
      var preset = sbPtcardPresetById(presetId) || sbAvailablePtcardPresets()[0];
      if (!preset) return;
      sbPtcardCards[cardIndex] = sbPtcardCards[cardIndex] || {};
      sbPtcardCards[cardIndex].presetId = preset.id;
      sbPtcardFramePresetId = preset.id;
      if (Number(preset.editableSides || 1) !== 2 && sbPtcardActiveSide === 'back') {
        sbPtcardActiveSide = 'front';
        sbPtcardActiveSlot = 0;
      }
      sbPtcardActiveSlot = Math.min(sbPtcardActiveSlot, sbPtcardSideSlots(preset, sbPtcardActiveSide).length - 1);
      if (sbPtcardCards[cardIndex].slot) sbConstrainSlot(sbPtcardCards[cardIndex].slot, sbPtcardFrameSlot(preset));
      sbPtcardPreviewCards = [];
      sbPtcardPreviewSignature = '';
      sbRenderPtcardComposer();
    };

    window.sbUploadPtcard = function (cardIndex) {
      if (!sbRequireEditOpen()) return;
      sbPtcardUploadTarget = sbClamp(Number(cardIndex || 0), 0, Math.max(0, sbPtcardCards.length - 1));
      sbPtcardActive = sbPtcardUploadTarget;
      sbPtcardUploadSide = sbPtcardActiveSide;
      sbPtcardUploadSlot = sbPtcardActiveSlot;
      sbRenderPtcardComposer();
      var input = $('sbPtcardUploadInput');
      if (input) input.click();
    };

    window.sbPickDriveToPtcard = function (imageIdx, cardIndex) {
      if (!sbRequireEditOpen()) return;
      var f = sbImages[imageIdx];
      if (!f) return;
      var src = f.originalImageUrl || f.previewUrl || f.viewUrl || f.thumbnailUrl;
      if (!src) return;
      cardIndex = sbClamp(Number(cardIndex || 0), 0, Math.max(0, sbPtcardCards.length - 1));
      var preset = sbPtcardPresetForCard(cardIndex);
      sbPtcardCards[cardIndex] = sbPtcardCards[cardIndex] || {};
      sbPtcardCards[cardIndex].slot = { src: src, source: 'drive', id: f.id || '', name: f.name || ('ptcard_' + (cardIndex + 1) + '.jpg'), zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, flipX: false, autoFit: true };
      sbConstrainSlot(sbPtcardCards[cardIndex].slot, sbPtcardFrameSlot(preset));
      sbPtcardActive = cardIndex;
      sbPtcardPreviewCards = [];
      sbPtcardPreviewSignature = '';
      sbRenderPtcardComposer();
    };

    window.sbRememberPtcardImageSize = function (cardIndex, imageEl) {
      var card = sbPtcardCards[cardIndex] || {};
      var slot = card.slot;
      if (!slot || !imageEl) return;
      var iw = Number(imageEl.naturalWidth || imageEl.width || 0);
      var ih = Number(imageEl.naturalHeight || imageEl.height || 0);
      if (iw > 0 && ih > 0) {
        slot.imgW = iw;
        slot.imgH = ih;
        var preset = sbPtcardPresetForCard(cardIndex);
        slot.minZoom = sbMinFillZoom(slot, sbPtcardFrameSlot(preset));
        if (slot.autoFit !== false || Number(slot.zoom || 1) < Number(slot.minZoom || 1)) {
          slot.zoom = Number(slot.minZoom || 1);
          slot.offsetX = 0;
          slot.offsetY = 0;
          slot.autoFit = false;
        }
        sbConstrainSlot(slot, sbPtcardFrameSlot(preset));
        sbUpdateExtraSlotDom('ptcard', cardIndex);
      }
    };

    window.sbSetPtcardZoom = function (value) {
      var card = sbPtcardCards[sbPtcardActive] || {};
      if (!card.slot) return;
      card.slot.autoFit = false;
      card.slot.zoom = Math.max(Number(card.slot.minZoom || 1), Number(value || 100) / 100);
      sbConstrainSlot(card.slot, sbPtcardFrameSlot(sbPtcardPresetForCard(sbPtcardActive)));
      sbInvalidateExtraPreview('ptcard');
      sbUpdateExtraSlotDom('ptcard', sbPtcardActive);
    };

    window.sbSetPtcardRotate = function (value) {
      var card = sbPtcardCards[sbPtcardActive] || {};
      if (!card.slot) return;
      card.slot.autoFit = false;
      card.slot.rotate = sbNormalizeRotation(value);
      sbConstrainSlot(card.slot, sbPtcardFrameSlot(sbPtcardPresetForCard(sbPtcardActive)));
      sbInvalidateExtraPreview('ptcard');
      sbUpdateExtraSlotDom('ptcard', sbPtcardActive);
    };

    window.sbBumpPtcardRotate = function (delta) {
      var card = sbPtcardCards[sbPtcardActive] || {};
      window.sbSetPtcardRotate(Number(card.slot && card.slot.rotate || 0) + Number(delta || 0));
    };

    window.sbMovePtcard = function (dx, dy) {
      var card = sbPtcardCards[sbPtcardActive] || {};
      if (!card.slot) return;
      card.slot.autoFit = false;
      card.slot.offsetX = Number(card.slot.offsetX || 0) + Number(dx || 0);
      card.slot.offsetY = Number(card.slot.offsetY || 0) + Number(dy || 0);
      sbConstrainSlot(card.slot, sbPtcardFrameSlot(sbPtcardPresetForCard(sbPtcardActive)));
      sbInvalidateExtraPreview('ptcard');
      sbUpdateExtraSlotDom('ptcard', sbPtcardActive);
    };

    window.sbFlipPtcard = function (cardIndex) {
      if (!sbRequireEditOpen()) return;
      cardIndex = sbClamp(Number(cardIndex || 0), 0, Math.max(0, sbPtcardCards.length - 1));
      var card = sbPtcardCards[cardIndex] || {};
      if (!card.slot) return;
      card.slot.flipX = !card.slot.flipX;
      sbInvalidateExtraPreview('ptcard');
      sbUpdateExtraSlotDom('ptcard', cardIndex);
    };

    window.sbClearPtcard = function (cardIndex) {
      if (!sbRequireEditOpen()) return;
      cardIndex = sbClamp(Number(cardIndex || 0), 0, Math.max(0, sbPtcardCards.length - 1));
      if (sbPtcardCards[cardIndex]) sbPtcardCards[cardIndex].slot = null;
      sbPtcardPreviewCards = [];
      sbPtcardPreviewSignature = '';
      sbRenderPtcardComposer();
    };

    window.sbPreviewPtcard = function () {
      if (!sbRequireEditOpen()) return;
      renderSbPtcardDataUrls({ allowMissing: true }).catch(function (err) {
        window.alert((err && err.message) || 'Chưa tạo được preview PT Card.');
      });
    };

    window.sbShowExtraComposerInfo = function (kind) {
      if (kind === 'cd') {
        sbShowHelpModal('Hướng dẫn ghép CD', [
          ['1', 'Chọn ảnh từ máy', 'Bấm dấu + trên slot CD để chọn ảnh từ máy hoặc điện thoại.'],
        ['2', 'Căn ảnh trong frame', 'Ảnh tự fit vào vùng in. Sau đó kéo trực tiếp trên mặt đĩa, dùng Zoom, Xoay hoặc Lật để chỉnh giống frame chính. Có thể nhập số độ để xoay chính xác.'],
          ['3', 'Xem trước rồi gửi', 'Bấm Xem trước CD để kiểm tra file một mặt đĩa trước khi gửi về thu ngân.']
        ]);
        return;
      }
      sbShowHelpModal('Hướng dẫn ghép PT Card', [
        ['1', 'Chọn ảnh từ máy', 'Bấm dấu + trên slot card để chọn ảnh từ máy hoặc điện thoại.'],
        ['2', 'Căn ảnh trong frame', 'Ảnh tự fit vào vùng in. Sau đó kéo trực tiếp trên mặt trước, dùng Zoom, Xoay hoặc Lật để chỉnh giống frame chính. Có thể nhập số độ để xoay chính xác; trên điện thoại có thể dùng pinch zoom.'],
        ['3', 'Kiểm tra hai mặt', 'Mặt sau của từng card hiển thị cạnh mặt trước. Bấm Xem trước PT Card để kiểm tra cả mặt trước và mặt sau trước khi gửi.']
      ]);
    };

    function sbExtraSetActive(kind, index) {
      index = Math.max(0, Number(index || 0));
      if (kind === 'cd') {
        sbCdActive = sbClamp(index, 0, Math.max(0, sbCdCards.length - 1));
      } else {
        sbPtcardActive = sbClamp(index, 0, Math.max(0, sbPtcardCards.length - 1));
      }
    }

    function sbExtraActiveIndex(kind) {
      return kind === 'cd' ? sbCdActive : sbPtcardActive;
    }

    function sbExtraCards(kind) {
      return kind === 'cd' ? sbCdCards : sbPtcardCards;
    }

    function sbExtraSlot(kind, index) {
      var cards = sbExtraCards(kind);
      var item = cards[index] || {};
      return item.slot || null;
    }

    function sbExtraFrameSlot(kind, index) {
      var preset = kind === 'cd' ? sbCdPresetForDisc(index) : sbPtcardPresetForCard(index);
      return sbPtcardFrameSlot(preset);
    }

    function sbInvalidateExtraPreview(kind) {
      if (kind === 'cd') {
        sbCdPreviewCards = [];
        sbCdPreviewSignature = '';
      } else {
        sbPtcardPreviewCards = [];
        sbPtcardPreviewSignature = '';
      }
    }

    function sbRenderExtraComposer(kind) {
      if (kind === 'cd') sbRenderCdComposer();
      else sbRenderPtcardComposer();
    }

    function sbUpdateExtraSlotDom(kind, index) {
      var slot = sbExtraSlot(kind, index);
      var img = document.querySelector('[data-sb-extra-image="' + kind + '-' + index + (kind === 'ptcard' ? '-' + sbPtcardActiveSide + '-' + sbPtcardActiveSlot : '') + '"]');
      if (slot && img) img.style.cssText = sbSlotImageStyle(slot, sbExtraFrameSlot(kind, index));
      if (index === sbExtraActiveIndex(kind)) {
        var zoom = slot ? Math.round(Math.max(Number(slot.minZoom || 1), Number(slot.zoom || 1)) * 100) : 100;
        var range = $(kind === 'cd' ? 'sbCdZoomRange' : 'sbPtcardZoomRange');
        var label = $(kind === 'cd' ? 'sbCdZoomValue' : 'sbPtcardZoomValue');
        var rotateRange = $(kind === 'cd' ? 'sbCdRotateRange' : 'sbPtcardRotateRange');
        var rotateInput = $(kind === 'cd' ? 'sbCdRotateInput' : 'sbPtcardRotateInput');
        var rotateLabel = $(kind === 'cd' ? 'sbCdRotateValue' : 'sbPtcardRotateValue');
        if (range) {
          var minZoom = slot ? Math.round(Math.max(1, Number(slot.minZoom || 1)) * 100) : 100;
          range.min = String(minZoom);
          range.max = String(Math.max(260, minZoom + 160));
          range.value = String(zoom);
        }
        if (label) label.textContent = zoom + '%';
        if (rotateRange) rotateRange.value = String(slot ? sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '') : 0);
        if (rotateInput) rotateInput.value = String(slot ? sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '') : 0);
        if (rotateLabel) rotateLabel.textContent = (slot ? sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '') : '0') + '°';
      }
    }

    function sbExtraGesturePointList(kind, index) {
      return Object.keys(sbExtraGesturePointers).map(function (key) { return sbExtraGesturePointers[key]; }).filter(function (point) {
        return point && point.kind === kind && point.index === index;
      });
    }

    function sbStartExtraPinchGesture(kind, index, target) {
      var points = sbExtraGesturePointList(kind, index);
      if (points.length < 2) return false;
      var slot = sbExtraSlot(kind, index);
      if (!slot) return false;
      var box = target.getBoundingClientRect();
      var center = sbGestureCenter(points[0], points[1]);
      sbExtraDragState = {
        mode: 'pinch',
        kind: kind,
        index: index,
        target: target,
        dragging: true,
        boxW: Math.max(1, box.width),
        boxH: Math.max(1, box.height),
        startDistance: sbGestureDistance(points[0], points[1]),
        startCenterX: center.x,
        startCenterY: center.y,
        startZoom: Number(slot.zoom || 1),
        offsetX: Number(slot.offsetX || 0),
        offsetY: Number(slot.offsetY || 0)
      };
      return true;
    }

    window.sbStartExtraFrameDrag = function (event, kind, index) {
      if (sbIsEditExpired()) return;
      kind = kind === 'cd' ? 'cd' : 'ptcard';
      index = sbClamp(Number(index || 0), 0, Math.max(0, sbExtraCards(kind).length - 1));
      var slot = sbExtraSlot(kind, index);
      if (!slot || !slot.src) return;
      if (event.cancelable) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      sbExtraSetActive(kind, index);
      var box = event.currentTarget.getBoundingClientRect();
      sbExtraGesturePointers[event.pointerId] = { pointerId: event.pointerId, kind: kind, index: index, clientX: event.clientX, clientY: event.clientY };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) {}
      if (sbStartExtraPinchGesture(kind, index, event.currentTarget)) return;
      sbExtraDragState = {
        mode: 'drag',
        kind: kind,
        index: index,
        pointerId: event.pointerId,
        target: event.currentTarget,
        dragging: false,
        startX: event.clientX,
        startY: event.clientY,
        boxW: Math.max(1, box.width),
        boxH: Math.max(1, box.height),
        offsetX: Number(slot.offsetX || 0),
        offsetY: Number(slot.offsetY || 0)
      };
    };

    function sbHandleExtraPointerMove(event) {
      if (sbExtraGesturePointers[event.pointerId]) {
        sbExtraGesturePointers[event.pointerId].clientX = event.clientX;
        sbExtraGesturePointers[event.pointerId].clientY = event.clientY;
      }
      if (!sbExtraDragState) return false;
      var kind = sbExtraDragState.kind;
      var index = sbExtraDragState.index;
      var slot = sbExtraSlot(kind, index);
      if (!slot) return true;
      if (sbExtraDragState.mode === 'pinch') {
        var points = sbExtraGesturePointList(kind, index);
        if (points.length < 2) return true;
        if (event.cancelable) event.preventDefault();
        var center = sbGestureCenter(points[0], points[1]);
        var ratio = sbGestureDistance(points[0], points[1]) / Math.max(1, Number(sbExtraDragState.startDistance || 1));
        slot.autoFit = false;
        var frameSlot = sbExtraFrameSlot(kind, index);
        var minZoom = sbMinFillZoom(slot, frameSlot);
        var maxZoom = Math.max(2.6, minZoom + 1.6);
        slot.zoom = Math.max(minZoom, Math.min(maxZoom, Number(sbExtraDragState.startZoom || 1) * ratio));
        slot.offsetX = Number(sbExtraDragState.offsetX || 0) + ((center.x - Number(sbExtraDragState.startCenterX || center.x)) / Math.max(1, sbExtraDragState.boxW)) * 100;
        slot.offsetY = Number(sbExtraDragState.offsetY || 0) + ((center.y - Number(sbExtraDragState.startCenterY || center.y)) / Math.max(1, sbExtraDragState.boxH)) * 100;
        sbConstrainSlot(slot, frameSlot);
        sbUpdateExtraSlotDom(kind, index);
        return true;
      }
      if (sbExtraDragState.pointerId !== event.pointerId) {
        if (sbStartExtraPinchGesture(kind, index, sbExtraDragState.target)) return true;
        return true;
      }
      var dx = event.clientX - sbExtraDragState.startX;
      var dy = event.clientY - sbExtraDragState.startY;
      if (!sbExtraDragState.dragging) {
        if (Math.sqrt(dx * dx + dy * dy) < 8) return true;
        sbExtraDragState.dragging = true;
        try { sbExtraDragState.target.setPointerCapture(sbExtraDragState.pointerId); } catch (e) {}
      }
      if (event.cancelable) event.preventDefault();
      slot.autoFit = false;
      slot.offsetX = Number(sbExtraDragState.offsetX || 0) + (dx / Math.max(1, sbExtraDragState.boxW)) * 100;
      slot.offsetY = Number(sbExtraDragState.offsetY || 0) + (dy / Math.max(1, sbExtraDragState.boxH)) * 100;
      sbConstrainSlot(slot, sbExtraFrameSlot(kind, index));
      sbUpdateExtraSlotDom(kind, index);
      return true;
    }

    function sbHandleExtraPointerEnd(event) {
      var hadPoint = !!sbExtraGesturePointers[event.pointerId];
      var state = sbExtraDragState;
      var didMove = !!(state && state.dragging);
      var kind = state ? state.kind : (hadPoint ? sbExtraGesturePointers[event.pointerId].kind : '');
      var index = state ? state.index : (hadPoint ? sbExtraGesturePointers[event.pointerId].index : -1);
      if (!hadPoint && !state) return false;
      delete sbExtraGesturePointers[event.pointerId];
      if (didMove && kind) sbInvalidateExtraPreview(kind);
      if (state && kind && index >= 0 && sbExtraGesturePointList(kind, index).length === 1) {
        var point = sbExtraGesturePointList(kind, index)[0];
        var slot = sbExtraSlot(kind, index);
        var target = state.target;
        if (slot && target) {
          var box = target.getBoundingClientRect();
          sbExtraDragState = {
            mode: 'drag',
            kind: kind,
            index: index,
            pointerId: point.pointerId,
            target: target,
            dragging: false,
            startX: point.clientX,
            startY: point.clientY,
            boxW: Math.max(1, box.width),
            boxH: Math.max(1, box.height),
            offsetX: Number(slot.offsetX || 0),
            offsetY: Number(slot.offsetY || 0)
          };
          return true;
        }
      }
      sbExtraDragState = null;
      if (kind) sbRenderExtraComposer(kind);
      return true;
    }

    function sbHandleExtraPointerCancel(event) {
      var hadPoint = !!sbExtraGesturePointers[event.pointerId];
      var state = sbExtraDragState;
      var kind = state ? state.kind : (hadPoint ? sbExtraGesturePointers[event.pointerId].kind : '');
      delete sbExtraGesturePointers[event.pointerId];
      if (!hadPoint && !state) return false;
      if (state && state.dragging && kind) sbInvalidateExtraPreview(kind);
      sbExtraDragState = null;
      if (kind) sbRenderExtraComposer(kind);
      return true;
    }

    function sbPresetButtonsHtml() {
      var p = sbPreset();
      return '<div class="sb-frame-choice-strip">' + sbAvailableFramePresets().map(function (item) {
        var active = item.id === p.id;
        var cardW = Number(item.width || 1200);
        var cardH = Number(item.height || 1800);
        var slots = Array.isArray(item.slots) ? item.slots : [];
        var slotHtml = slots.slice(0, 8).map(function (slot) {
          var left = (Number(slot.x || 0) / cardW) * 100;
          var top = (Number(slot.y || 0) / cardH) * 100;
          var width = (Number(slot.w || slot.width || 1) / cardW) * 100;
          var height = (Number(slot.h || slot.height || 1) / cardH) * 100;
          var rotate = Number(slot.rotate || 0);
          return '<i style="position:absolute;left:' + left.toFixed(3) + '%;top:' + top.toFixed(3) + '%;width:' + width.toFixed(3) + '%;height:' + height.toFixed(3) + '%;transform:rotate(' + rotate.toFixed(2) + 'deg);background:rgba(255,255,255,.78);border:1px dashed rgba(123,31,42,.46);box-sizing:border-box"></i>';
        }).join('');
        return '<button onclick="sbSetFramePreset(\'' + item.id + '\')" class="sb-frame-choice' + (active ? ' is-active' : '') + '"><div class="sb-frame-choice-preview" style="aspect-ratio:' + cardW + '/' + cardH + '">' + slotHtml + (item.overlayUrl ? '<img src="' + item.overlayUrl + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none">' : '') + '</div><div style="font-size:.72rem;line-height:1.25;white-space:normal">' + esc(item.label || 'Frame') + '</div><div style="font-size:.62rem;opacity:.72;margin-top:2px">' + slots.length + ' slot</div></button>';
      }).join('') + '</div>';
    }

    function sbApplyFramePreset() {
      var p = sbPreset();
      var frame = $('sbFrame');
      var title = $('sbFrameTitle');
      var footer = $('sbFrameFooter');
      var buttons = $('sbPresetButtons');
      if (frame) {
        frame.style.background = p.bg;
        frame.style.borderColor = p.border;
        frame.style.width = 'min(560px, 100%)';
        frame.style.aspectRatio = String(Number(p.width || 1200)) + ' / ' + String(Number(p.height || 1800));
        frame.style.minHeight = '0';
        frame.style.padding = p.overlayOnly ? '0' : '20px 16px 18px';
      }
      if (title) {
        title.textContent = p.title;
        title.style.color = p.accent;
        title.style.display = p.overlayOnly ? 'none' : 'block';
      }
      if (footer) {
        footer.style.color = p.text;
        footer.innerHTML = '<div style="font-family:Georgia,serif;text-align:center;font-size:2.1rem;font-style:italic;line-height:1">' + esc(p.signature) + '</div><div style="text-align:left;font-size:.62rem;font-weight:900;margin-top:8px">' + esc(p.footer) + '</div>';
        footer.style.display = p.overlayOnly ? 'none' : 'block';
      }
      var overlay = $('sbFrameOverlay');
      if (overlay) {
        overlay.innerHTML = p.overlayUrl ? '<img src="' + p.overlayUrl + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none">' : '';
      }
      if (buttons) {
        var oldStrip = buttons.querySelector && buttons.querySelector('.sb-frame-choice-strip');
        if (oldStrip) sbPresetScrollLeft = Number(oldStrip.scrollLeft || 0);
        buttons.innerHTML = sbPresetButtonsHtml();
        sbNormalizeButtons(buttons);
        var newStrip = buttons.querySelector && buttons.querySelector('.sb-frame-choice-strip');
        if (newStrip) {
          newStrip.scrollLeft = sbPresetScrollLeft;
          newStrip.onscroll = function () {
            sbPresetScrollLeft = Number(newStrip.scrollLeft || 0);
          };
          if (window.requestAnimationFrame) {
            window.requestAnimationFrame(function () {
              newStrip.scrollLeft = sbPresetScrollLeft;
            });
          }
        }
      }
    }

    function loadSb() {
      var sbUrl = API + '?action=getFiles&mode=sb&id=' + encodeURIComponent(fid);
      fetch(sbUrl, { redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { try { onViewerData(JSON.parse(t)); } catch (e) { showE('Lỗi', t.substring(0, 100)); } })
        .catch(function () {
          var cb = 'sbCb_' + Date.now();
          window[cb] = function (d) { delete window[cb]; onViewerData(d); };
          var s = document.createElement('script');
          s.src = sbUrl + '&callback=' + cb;
          s.onerror = function () { showE('Lỗi kết nối', 'Không thể kết nối server SelfBooth.'); };
          document.body.appendChild(s);
        });
    }

    var addonState = {
      manifest: {},
      services: {},
      sbFrames: [],
      ptcardFrames: [],
      keyCardFrames: [],
      items: [],
      activeService: 'sb_frame',
      activeIndex: 0,
      activeSlotIndex: 0,
      previews: [],
      message: '',
      busy: false,
      resultsDelivered: false,
      resultsTelegramNotified: false,
      submission: {}
    };
    var addonDragState = null;
    var addonGesturePointers = {};

    function addonServiceLabel(type) {
      return type === 'sb_frame' ? 'Frame ảnh SB' : type === 'ptcard' ? 'PT Card' : type === 'cd' ? 'CD/DVD' : type === 'key_card' ? 'Card key móc khóa' : 'Dịch vụ in thêm';
    }

    function addonPreviewGroups(previews) {
      var order = ['sb_frame', 'ptcard', 'cd', 'key_card'];
      return order.map(function (type) {
        return {
          type: type,
          label: addonServiceLabel(type),
          files: (previews || []).filter(function (file) { return String(file && file.service || file && file.kind || '') === type; })
        };
      }).filter(function (group) { return group.files.length; });
    }

    function addonPreviewFileLabel(file, index) {
      if (file && file.service === 'ptcard') return 'PT Card ' + (Number(file.item || 0) + 1) + (file.side === 'back' ? ' · Mặt sau' : ' · Mặt trước');
      if (file && file.kind === 'key_card_sheet') return 'Tờ móc khóa ' + (Number(file.sheet || 0) + 1);
      return (file && file.name ? String(file.name).replace(/^addon_[^_]+_\d+_/, '') : '') || ('File ' + (Number(index || 0) + 1));
    }

    function addonFramesForType(type) {
      if (type === 'key_card') {
        var shared = typeof ADDON_KEY_CARD_FRAME_PRESETS !== 'undefined' ? ADDON_KEY_CARD_FRAME_PRESETS : [];
        var manifest = addonState.keyCardFrames || [];
        var seen = {};
        return shared.concat(manifest).filter(function (frame) {
          var id = String(frame && frame.id || '');
          if (!id || seen[id]) return false;
          seen[id] = true;
          return true;
        });
      }
      if (type === 'cd') return (addonState.ptcardFrames || []).filter(function (frame) { return String(frame.kind || '').toLowerCase() === 'cd'; });
      if (type === 'ptcard') return (addonState.ptcardFrames || []).filter(function (frame) { return String(frame.kind || 'ptcard').toLowerCase() === 'ptcard'; });
      return addonState.sbFrames || [];
    }

    function addonDefaultFrameId(type) {
      var frames = addonFramesForType(type);
      return frames[0] && frames[0].id || (type === 'cd' ? 'cd-direct-upload' : '');
    }

    function addonFrameUrl(frame) {
      return frame && (frame.url || frame.overlayUrl || frame.frontUrl || (frame.overlay && frame.overlay.url)) || '';
    }

    function addonFrameChoicePreviewHtml(frame, type) {
      var width = Number(frame && frame.width || (type === 'cd' ? 1417 : 1200));
      var height = Number(frame && frame.height || (type === 'cd' ? 1417 : 1800));
      var slots = addonFrameSlots(frame, type);
      var slotHtml = slots.slice(0, 24).map(function (slot) {
        var left = (Number(slot.x || 0) / width) * 100;
        var top = (Number(slot.y || 0) / height) * 100;
        var slotWidth = (Number(slot.w || 1) / width) * 100;
        var slotHeight = (Number(slot.h || 1) / height) * 100;
        return '<i style="position:absolute;left:' + left.toFixed(3) + '%;top:' + top.toFixed(3) + '%;width:' + slotWidth.toFixed(3) + '%;height:' + slotHeight.toFixed(3) + '%;transform:rotate(' + Number(slot.rotate || 0).toFixed(2) + 'deg);background:rgba(255,255,255,.72);border:1px dashed rgba(83,96,72,.58);box-sizing:border-box"></i>';
      }).join('');
      var overlay = addonFrameUrl(frame);
      return slotHtml + (overlay ? '<img src="' + escAttr(overlay) + '" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none">' : '');
    }

    function addonFrameCardRegions(frame, type) {
      var frameWidth = Math.max(1, Number(frame && frame.width || (type === 'cd' ? 1417 : 1200)));
      var frameHeight = Math.max(1, Number(frame && frame.height || (type === 'cd' ? 1417 : 1800)));
      var configured = frame && Array.isArray(frame.cardRegions || frame.card_regions)
        ? (frame.cardRegions || frame.card_regions) : [];
      // Add-on manifests created before cardRegions existed can still use the
      // same embedded SelfBooth definition as the normal viewer.
      if (!configured.length && type === 'sb_frame' && typeof SB_FRAME_PRESETS !== 'undefined') {
        var embedded = (SB_FRAME_PRESETS || []).filter(function (item) { return item && frame && item.id === frame.id; })[0];
        configured = embedded && Array.isArray(embedded.cardRegions) ? embedded.cardRegions : [];
      }
      var normalized = configured.map(function (region) {
        return {
          x: Math.max(0, Number(region.x || 0)),
          y: Math.max(0, Number(region.y || 0)),
          w: Math.max(1, Number(region.w || region.width || 1)),
          h: Math.max(1, Number(region.h || region.height || 1)),
          rotate: Number(region.rotate || 0),
          label: String(region.label || region.name || '').trim()
        };
      }).filter(function (region) { return region.w > 1 && region.h > 1; });
      return normalized.length ? sbSortCardRegions(normalized) : [{ x: 0, y: 0, w: frameWidth, h: frameHeight, rotate: 0, label: '' }];
    }

    function addonRegionLabel(region, index) {
      return String(region && region.label || '').trim() || ('Card ' + (Number(index || 0) + 1));
    }

    function addonOverlayCropHtml(frame, region, frameWidth, frameHeight) {
      var overlay = addonFrameUrl(frame);
      if (!overlay || !region) return '';
      var left = region.w ? (-region.x / region.w) * 100 : 0;
      var top = region.h ? (-region.y / region.h) * 100 : 0;
      var width = region.w ? (frameWidth / region.w) * 100 : 100;
      var height = region.h ? (frameHeight / region.h) * 100 : 100;
      return '<div class="sb-small-card-overlay"><img src="' + escAttr(overlay) + '" alt="" loading="lazy" style="left:' + left.toFixed(4) + '%;top:' + top.toFixed(4) + '%;width:' + width.toFixed(4) + '%;height:' + height.toFixed(4) + '%"></div>';
    }

    function addonPtcardBackHtml(frame) {
      var backUrl = frame && frame.backUrl;
      var width = Math.max(1, Number(frame && frame.width || 2055));
      var height = Math.max(1, Number(frame && frame.height || 1299));
      var body = backUrl
        ? '<img src="' + escAttr(backUrl) + '" alt="Mặt sau PT Card" loading="lazy">'
        : '<div class="addon-ptcard-back-missing">Frame này chưa có mặt sau</div>';
      return '<div class="addon-ptcard-side"><span class="addon-ptcard-side-title">Mặt sau</span><div class="addon-ptcard-back-canvas" style="aspect-ratio:' + width + '/' + height + '">' + body + '</div></div>';
    }

    function addonSmallCardSlotHtml(itemIndex, slotIndex, slot, definition, region, frame) {
      var left = ((Number(definition.x || 0) - region.x) / region.w) * 100;
      var top = ((Number(definition.y || 0) - region.y) / region.h) * 100;
      var width = (Number(definition.w || 1) / region.w) * 100;
      var height = (Number(definition.h || 1) / region.h) * 100;
      var active = itemIndex === addonState.activeIndex && slotIndex === addonState.activeSlotIndex;
      var hasImage = Boolean(slot && slot.src);
      var rotation = Number(definition.rotate || 0);
      var plusSize = 'clamp(18px,' + Math.max(2.6, Math.min(width, height) * .72).toFixed(2) + 'vw,46px)';
      addonConstrainSlot(slot, definition);
      var geometry = 'left:' + left.toFixed(4) + '%;top:' + top.toFixed(4) + '%;width:' + width.toFixed(4) + '%;height:' + height.toFixed(4) + '%;transform:rotate(' + rotation.toFixed(3) + 'deg)';
      var base = '<div data-addon-slot="' + itemIndex + '-' + slotIndex + '" class="sb-small-card-slot-base" style="' + geometry + ';border:1px solid rgba(222,210,189,.9);background:' + escAttr(frame && frame.slotBg || '#fbf4ef') + ';border-radius:8px">';
      if (hasImage) base += '<img src="' + escAttr(slot.src) + '" alt="" draggable="false" onload="addonRememberSlotImageSize(' + itemIndex + ',' + slotIndex + ',this)" style="' + addonSlotImageStyle(slot, definition) + '">';
      base += '</div>';
      var controlStyle = geometry + ';--slot-plus-size:' + plusSize + ';touch-action:' + (hasImage ? 'none' : 'manipulation') + ';border:' + (active ? '1px solid rgba(255,255,255,.72)' : '1px solid rgba(222,210,189,.9)') + ';box-shadow:' + (active ? '0 0 0 3px ' + escAttr(frame && frame.accent || '#536048') + ' inset' : 'none') + ';border-radius:8px';
      var controlTag = hasImage ? 'div' : 'label';
      var control = '<' + controlTag + ' data-addon-slot="' + itemIndex + '-' + slotIndex + '" class="sb-small-card-slot-control" ' + (hasImage ? 'onclick="addonSelectSlot(event,' + itemIndex + ',' + slotIndex + ')" onpointerdown="addonStartSlotDrag(event,' + itemIndex + ',' + slotIndex + ')"' : '') + ' style="' + controlStyle + '">';
      if (!hasImage) control += '<input type="file" accept="image/*" onchange="addonPickSlotFile(event,' + itemIndex + ',' + slotIndex + ')" style="display:none"><div class="sb-empty-slot-hint"><div><b>+</b></div></div>';
      control += '<div class="sb-slot-preview-num" style="position:absolute;left:5px;top:5px;background:rgba(255,255,255,.92);border-radius:999px;padding:2px 6px;font-size:.62rem;font-weight:900;color:#4D493F;z-index:9">' + esc(definition.label || ('Ảnh ' + (slotIndex + 1))) + '</div></' + controlTag + '>';
      return { base: base, control: control };
    }

    function addonFrameSlots(frame, type) {
      var width = Number(frame && frame.width || (type === 'cd' ? 1417 : 1200));
      var height = Number(frame && frame.height || (type === 'cd' ? 1417 : 1800));
      var configured = frame && Array.isArray(frame.slots) ? frame.slots : [];
      var preset = null;
      if (type === 'sb_frame' && typeof SB_FRAME_PRESETS !== 'undefined') {
        preset = (SB_FRAME_PRESETS || []).filter(function (item) { return item && frame && item.id === frame.id; })[0] || null;
      }
      if (!configured.length && preset && Array.isArray(preset.slots)) configured = preset.slots;
      if (!configured.length) configured = [{ x: 0, y: 0, w: width, h: height, label: 'Ảnh 1' }];
      return configured.map(function (slot, index) {
        var fallback = preset && preset.slots && preset.slots[index] || {};
        return {
          id: 'slot_' + index,
          label: String(slot.label || slot.name || fallback.label || fallback.name || ('Ảnh ' + (index + 1))),
          x: Math.max(0, Number(slot.x || 0)),
          y: Math.max(0, Number(slot.y || 0)),
          w: Math.max(1, Number(slot.w || slot.width || width)),
          h: Math.max(1, Number(slot.h || slot.height || height)),
          rotate: Number(slot.rotate || 0)
        };
      });
    }

    function addonClamp(value, min, max) {
      return Math.max(min, Math.min(max, Number(value || 0)));
    }

    function addonNormalizeRotation(value) {
      var rotation = Number(value || 0);
      if (!isFinite(rotation)) rotation = 0;
      rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
      return Math.abs(rotation) < .001 ? 0 : rotation;
    }

    function addonCoverDrawSize(slot, definition) {
      var imageWidth = Number(slot && slot.imgW || 0);
      var imageHeight = Number(slot && slot.imgH || 0);
      var slotWidth = Number(definition && definition.w || 0);
      var slotHeight = Number(definition && definition.h || 0);
      if (!(imageWidth > 0 && imageHeight > 0 && slotWidth > 0 && slotHeight > 0)) return { w: slotWidth || 1, h: slotHeight || 1 };
      var scale = Math.max(slotWidth / imageWidth, slotHeight / imageHeight);
      return { w: imageWidth * scale, h: imageHeight * scale };
    }

    function addonMinFillZoom(slot, definition) {
      var slotWidth = Number(definition && definition.w || 0);
      var slotHeight = Number(definition && definition.h || 0);
      var base = addonCoverDrawSize(slot, definition);
      if (!(slotWidth > 0 && slotHeight > 0)) return 1;
      var angle = Math.abs(addonNormalizeRotation(slot && slot.rotate || 0)) * Math.PI / 180;
      var cosine = Math.abs(Math.cos(angle));
      var sine = Math.abs(Math.sin(angle));
      var requiredWidth = slotWidth * cosine + slotHeight * sine;
      var requiredHeight = slotWidth * sine + slotHeight * cosine;
      return Math.max(1, requiredWidth / Math.max(1, base.w), requiredHeight / Math.max(1, base.h));
    }

    function addonConstrainSlot(slot, definition) {
      if (!slot || !definition) return slot;
      slot.minZoom = addonMinFillZoom(slot, definition);
      slot.zoom = Math.max(Number(slot.minZoom || 1), Number(slot.zoom || 1));
      slot.offsetX = Number(slot.offsetX || 0);
      slot.offsetY = Number(slot.offsetY || 0);
      slot.rotate = addonNormalizeRotation(slot.rotate);
      slot.flipX = Boolean(slot.flipX);
      var base = addonCoverDrawSize(slot, definition);
      var slotWidth = Number(definition.w || 0);
      var slotHeight = Number(definition.h || 0);
      var drawWidth = base.w * slot.zoom;
      var drawHeight = base.h * slot.zoom;
      var limitX = slotWidth > 0 ? Math.max(0, ((drawWidth - slotWidth) / 2 / slotWidth) * 100) : 0;
      var limitY = slotHeight > 0 ? Math.max(0, ((drawHeight - slotHeight) / 2 / slotHeight) * 100) : 0;
      slot.offsetX = addonClamp(slot.offsetX, -limitX, limitX);
      slot.offsetY = addonClamp(slot.offsetY, -limitY, limitY);
      return slot;
    }

    function addonSlotImageStyle(slot, definition) {
      addonConstrainSlot(slot, definition);
      var imageWidth = Number(slot && slot.imgW || 0);
      var imageHeight = Number(slot && slot.imgH || 0);
      var slotWidth = Number(definition && definition.w || 1);
      var slotHeight = Number(definition && definition.h || 1);
      var imageRatio = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1;
      var slotRatio = slotWidth / slotHeight;
      var fit = imageRatio >= slotRatio ? 'height:100%;width:auto;' : 'width:100%;height:auto;';
      var flip = slot && slot.flipX ? -1 : 1;
      return 'position:absolute;left:calc(50% + ' + Number(slot.offsetX || 0).toFixed(3) + '%);top:calc(50% + ' + Number(slot.offsetY || 0).toFixed(3) + '%);' + fit + 'min-width:100%;min-height:100%;max-width:none;max-height:none;object-fit:cover;display:block;transform-origin:center center;transform:translate(-50%,-50%) rotate(' + Number(slot.rotate || 0).toFixed(3) + 'deg) scale(' + (Number(slot.zoom || 1) * flip).toFixed(3) + ',' + Number(slot.zoom || 1).toFixed(3) + ');';
    }

    function addonNewSlot(slot) {
      return {
        id: slot.id,
        label: slot.label,
        file: null,
        src: '',
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        rotate: 0,
        flipX: false,
        autoFit: true,
        imgW: 0,
        imgH: 0,
        minZoom: 1
      };
    }

    function addonSyncItemSlots(item) {
      var frame = addonFrameById(item.type, item.frameId);
      var definitions = addonFrameSlots(frame, item.type);
      var previous = item.slots || [];
      item.slots = definitions.map(function (definition, index) {
        var saved = previous[index] || addonNewSlot(definition);
        saved.id = definition.id;
        saved.label = definition.label;
        addonConstrainSlot(saved, definition);
        return saved;
      });
      item.slotDefinitions = definitions;
      addonState.activeSlotIndex = Math.max(0, Math.min(item.slots.length - 1, addonState.activeSlotIndex || 0));
    }

    function addonActiveItem() {
      return addonState.items[addonState.activeIndex] || addonState.items[0] || null;
    }

    function addonActiveSlot() {
      var item = addonActiveItem();
      return item && item.slots && item.slots[addonState.activeSlotIndex] || null;
    }

    function addonInitItems() {
      var items = [];
      var services = addonState.services || {};
      ['sb_frame', 'ptcard', 'cd', 'key_card'].forEach(function (type) {
        var qty = Math.max(0, Number(services[type] || 0));
        for (var index = 0; index < qty; index++) {
          items.push({
            id: type + '_' + index,
            type: type,
            index: index,
            frameId: addonDefaultFrameId(type),
            slots: [],
            slotDefinitions: []
          });
          addonSyncItemSlots(items[items.length - 1]);
        }
      });
      addonState.items = items;
      addonState.activeService = items[0] && items[0].type || 'sb_frame';
      addonState.activeIndex = 0;
      addonState.activeSlotIndex = 0;
    }

    function addonFrameById(type, frameId) {
      var frames = addonFramesForType(type);
      var selected = frames.filter(function (frame) { return frame.id === frameId; })[0] || frames[0] || null;
      if (!selected && type === 'cd') {
        return {
          id: 'cd-direct-upload', kind: 'cd', label: 'CD chưa có frame', width: 1417, height: 1417,
          slots: [{ x: 0, y: 0, w: 1417, h: 1417, label: 'Ảnh CD' }], directUpload: true
        };
      }
      return selected;
    }

    function addonScheduleSmallCardPacking() {
      var grids = document.querySelectorAll('[data-addon-card-grid]');
      if (!grids.length) return;
      Array.prototype.forEach.call(grids, sbStartSmartCardPacking);
      var apply = function () {
        Array.prototype.forEach.call(document.querySelectorAll('[data-addon-card-grid]'), sbApplySmartCardPacking);
      };
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(apply);
        });
      } else {
        window.setTimeout(apply, 0);
      }
      window.setTimeout(apply, 220);
    }

    function addonSubmissionExpired() {
      return Boolean(addonState.submission && addonState.submission.expired);
    }

    function addonSubmissionMessage() {
      return addonSubmissionExpired()
        ? 'Đơn in thêm đã hết 3 ngày gửi ảnh. Vui lòng liên hệ thu ngân nếu cần hỗ trợ.'
        : '';
    }

    function addonRender() {
      hide('ptbLoading');
      var items = addonState.items || [];
      var html = '';
      html += '<div class="sb-shell"><div class="addon-main">';
      if (!items.length) {
        html += '<div class="ptb-err"><h3>Chưa có dịch vụ</h3><p>Link này chưa được chọn dịch vụ in thêm.</p></div></div></div>';
        $('ptbContent').innerHTML = html;
        $('ptbContent').style.display = 'block';
        return;
      }
      var serviceTypes = ['sb_frame', 'ptcard', 'cd', 'key_card'].filter(function (type) {
        return items.some(function (item) { return item.type === type; });
      });
      if (serviceTypes.indexOf(addonState.activeService) < 0) addonState.activeService = serviceTypes[0] || 'sb_frame';
      var activeService = addonState.activeService;
      var serviceItems = items.map(function (item, idx) { return { item: item, idx: idx }; }).filter(function (entry) { return entry.item.type === activeService; });
      html += '<div class="addon-card addon-composer">';
      if (serviceTypes.length > 1) {
        html += '<div class="addon-service-tabs" aria-label="Chọn dịch vụ in thêm">';
        serviceTypes.forEach(function (type) {
          var count = items.filter(function (item) { return item.type === type; }).length;
          html += '<button class="addon-service-tab' + (type === activeService ? ' is-active' : '') + '" onclick="addonSelectService(\'' + type + '\')">' + esc(addonServiceLabel(type)) + ' · ' + count + '</button>';
        });
        html += '</div>';
      }
      html += '<section class="addon-service-card"><div class="addon-head"><div><strong>' + esc(addonServiceLabel(activeService)) + '</strong><span>' + serviceItems.length + (activeService === 'ptcard' ? ' card (mỗi card gồm mặt trước và mặt sau)' : ' tờ') + ' · Chạm từng slot để tải ảnh hoặc kéo ảnh để căn khung.</span></div></div>';
      var selectedServiceItem = items[addonState.activeIndex];
      if (!selectedServiceItem || selectedServiceItem.type !== activeService) {
        selectedServiceItem = serviceItems[0] && serviceItems[0].item;
        addonState.activeIndex = serviceItems[0] && serviceItems[0].idx || 0;
        addonState.activeSlotIndex = 0;
      }
      if (selectedServiceItem) {
        var activeFrames = addonFramesForType(activeService);
        if (activeFrames.length) {
          html += '<div class="addon-frame-picker-heading"><p class="addon-frame-picker-title">Bước 1: Chọn frame cho ' + (activeService === 'ptcard' ? 'PT Card ' : 'tờ ') + (selectedServiceItem.index + 1) + '</p>';
          if (activeService === 'ptcard' && serviceItems.length > 1) {
            html += '<label class="addon-ptcard-picker"><span>Đang chỉnh</span><select onchange="addonSelectItem(this.value)">';
            serviceItems.forEach(function (entry) {
              html += '<option value="' + entry.idx + '"' + (entry.idx === addonState.activeIndex ? ' selected' : '') + '>PT Card ' + (entry.item.index + 1) + '</option>';
            });
            html += '</select></label>';
          }
          html += '</div><div class="sb-frame-choice-strip">';
          activeFrames.forEach(function (frame) {
            var isSelected = frame.id === selectedServiceItem.frameId;
            html += '<button class="sb-frame-choice' + (isSelected ? ' is-active' : '') + '" onclick="addonSelectFrame(\'' + escAttr(frame.id) + '\')"><div class="sb-frame-choice-preview" style="aspect-ratio:' + Number(frame.width || 1200) + '/' + Number(frame.height || 1800) + ';background:' + escAttr(frame.bg || '#FCFAF5') + '">' + addonFrameChoicePreviewHtml(frame, activeService) + '</div><div>' + esc(frame.label || frame.id) + '</div><div style="font-size:.62rem;opacity:.72;margin-top:2px">' + addonFrameSlots(frame, activeService).length + ' slot</div></button>';
          });
          html += '</div><p class="addon-service-step">Bước 2: Bấm dấu + ngay trong từng slot của frame để tải ảnh. Bấm ảnh đã chọn để chỉnh.</p>';
        } else if (activeService === 'cd') {
          html += '<p class="addon-service-step">Chưa có frame CD/DVD. Bạn vẫn có thể bấm dấu + để tải ảnh và gửi thu ngân kiểm tra/in thử.</p>';
        } else {
          html += '<p class="addon-service-step">Chưa có frame cho dịch vụ này. Vui lòng báo thu ngân kiểm tra.</p>';
        }
      }
      html += '<div class="addon-sheet-list is-composer' + (activeService === 'ptcard' ? ' is-ptcard' : '') + '">';
      serviceItems.forEach(function (entry) {
        var item = entry.item;
        var idx = entry.idx;
        var frame = addonFrameById(item.type, item.frameId);
        var frameSlots = item.slotDefinitions || addonFrameSlots(frame, item.type);
        var frameWidth = Math.max(1, Number(frame && frame.width || (item.type === 'cd' ? 1417 : 1200)));
        var frameHeight = Math.max(1, Number(frame && frame.height || (item.type === 'cd' ? 1417 : 1800)));
        var regions = addonFrameCardRegions(frame, item.type);
        var cardGroups = sbCardSlotGroupsForEdit(frameSlots, regions);
        var chosen = (item.slots || []).filter(function (slot) { return slot.src; }).length;
        var isPtcard = item.type === 'ptcard';
        html += '<article class="addon-sheet' + (idx === addonState.activeIndex ? ' is-active' : '') + '" onclick="addonActivateItem(event,' + idx + ')"><div class="addon-sheet-head"><strong>' + (isPtcard ? 'PT Card ' : 'Tờ ') + (item.index + 1) + '</strong><span>' + chosen + '/' + frameSlots.length + ' slot</span></div>';
        if (isPtcard) html += '<div class="addon-ptcard-pair"><div class="addon-ptcard-side"><span class="addon-ptcard-side-title">Mặt trước</span>';
        html += '<div class="sb-small-card-edit-grid addon-small-card-edit-grid" data-addon-card-grid="' + idx + '">';
        cardGroups.forEach(function (group) {
          var region = group.region;
          var slotBaseHtml = '';
          var slotControlHtml = '';
          var filled = 0;
          group.slotItems.forEach(function (slotItem) {
            var slotIndex = slotItem.localSlot;
            var definition = slotItem.frameSlot || frameSlots[slotIndex];
            var slot = item.slots[slotIndex] || addonNewSlot(definition);
            if (slot.src) filled += 1;
            var layers = addonSmallCardSlotHtml(idx, slotIndex, slot, definition, region, frame);
            slotBaseHtml += layers.base;
            slotControlHtml += layers.control;
          });
          if (!group.slotItems.length) return;
          var ratio = Number(region.w || 1) / Math.max(1, Number(region.h || 1));
          var tileClass = (ratio < .5 || (ratio < 1 && group.slotItems.length <= 2)) ? ' is-skinny-portrait' : ' is-fullrow';
          html += '<div class="sb-small-card-edit-tile' + tileClass + '" data-sb-region-ratio="' + ratio.toFixed(4) + '" data-sb-slot-count="' + group.slotItems.length + '">';
          if (!isPtcard) html += '<div class="sb-small-card-edit-head"><span>' + esc(addonRegionLabel(region, group.regionIndex)) + '</span><span>' + filled + '/' + group.slotItems.length + ' slot</span></div>';
          html += '<div class="sb-small-card-edit-canvas" style="--sb-card-ratio:' + Number(region.w || 1) + ' / ' + Number(region.h || 1) + ';background:' + escAttr(frame && frame.bg || '#FCFAF5') + '">';
          html += slotBaseHtml + addonOverlayCropHtml(frame, region, frameWidth, frameHeight) + slotControlHtml + '</div></div>';
        });
        html += '</div>';
        if (isPtcard) html += '</div>' + addonPtcardBackHtml(frame) + '</div>';
        html += '</article>';
      });
      html += '</div></section></div>';
      var activeItem = addonActiveItem();
      var activeSlot = addonActiveSlot();
      if (activeItem && activeSlot && activeSlot.src) {
        var activeDefinition = activeItem.slotDefinitions && activeItem.slotDefinitions[addonState.activeSlotIndex];
        if (activeDefinition) addonConstrainSlot(activeSlot, activeDefinition);
        var activeMinZoom = Math.max(100, Math.ceil(Number(activeSlot.minZoom || 1) * 100));
        var activeZoom = Math.max(activeMinZoom, Math.round(Number(activeSlot.zoom || 1) * 100));
        var activeMaxZoom = Math.max(250, activeMinZoom + 160);
        var activeRotate = Number(activeSlot.rotate || 0).toFixed(1).replace(/\.0$/, '');
        html += '<div class="sb-bottom-editor is-open"><div id="addonEditPanel" style="border:1px solid #DED2BD;background:#FCFAF5;border-radius:12px;padding:10px;margin-bottom:10px;box-shadow:0 12px 32px rgba(92,55,40,.12)">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><strong style="font-size:.78rem;color:#766E60">Chỉnh ảnh trong slot ' + esc(activeSlot.label || 'ảnh') + '</strong><button onclick="addonCloseEditPanel()" style="width:28px;height:28px;border:1px solid #DED2BD;border-radius:999px;background:#FCFAF5;color:#766E60;font-weight:900">x</button></div>';
        html += '<div style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:10px;align-items:center;margin-bottom:8px"><span style="font-size:.82rem;color:#536048;font-weight:900">Zoom</span><input id="addonZoomRange" oninput="addonSetZoom(this.value)" type="range" min="' + activeMinZoom + '" max="' + activeMaxZoom + '" value="' + activeZoom + '" style="width:100%;accent-color:#536048"><strong id="addonZoomValue" style="font-size:.78rem;color:#766E60;min-width:42px;text-align:center">' + activeZoom + '%</strong><button class="sb-mini-tool-btn" onclick="addonFlipActive()"><span aria-hidden="true">&#8646;</span><span>LẬT</span></button><button class="sb-mini-tool-btn danger" onclick="addonClearActive()"><span aria-hidden="true">&#10005;</span><span>XÓA</span></button></div>';
        html += '<div class="sb-rotate-slider-grid"><span style="font-size:.82rem;color:#536048;font-weight:900">Xoay</span><input id="addonRotateRange" oninput="addonSetRotate(this.value)" type="range" min="-180" max="180" step="1" value="' + activeRotate + '" style="width:100%;accent-color:#536048"><strong id="addonRotateValue" style="font-size:.78rem;color:#766E60;min-width:42px;text-align:center">' + activeRotate + '°</strong></div>';
        html += '<div class="sb-rotate-detail-grid"><span style="font-size:.82rem;color:#536048;font-weight:900">Độ</span><input class="sb-rotate-number" id="addonRotateInput" oninput="addonSetRotate(this.value)" type="number" min="-180" max="180" step="0.1" value="' + activeRotate + '"><button class="sb-mini-tool-btn" onclick="addonBumpRotate(-1)"><span aria-hidden="true">↶</span><span>-1°</span></button><button class="sb-mini-tool-btn" onclick="addonBumpRotate(1)"><span aria-hidden="true">↷</span><span>+1°</span></button></div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px"><label class="sb-mini-tool-btn" style="cursor:pointer"><span aria-hidden="true">⇧</span><span>THAY ẢNH</span><input type="file" accept="image/*" onchange="addonPickSlotFile(event,' + addonState.activeIndex + ',' + addonState.activeSlotIndex + ')" style="display:none"></label><button class="sb-mini-tool-btn" onclick="addonResetActive()"><span aria-hidden="true">↻</span><span>ĐẶT LẠI</span></button><button class="sb-mini-tool-btn" onclick="addonNudge(\'offsetY\',-4)">↑ LÊN</button><button class="sb-mini-tool-btn" onclick="addonNudge(\'offsetX\',-4)">← TRÁI</button><button class="sb-mini-tool-btn" onclick="addonNudge(\'offsetX\',4)">→ PHẢI</button><button class="sb-mini-tool-btn" onclick="addonNudge(\'offsetY\',4)">↓ XUỐNG</button></div>';
        html += '</div></div>';
      }
      if (addonState.previews.length) {
        addonPreviewGroups(addonState.previews).forEach(function (group) {
          html += '<div class="addon-card"><div class="addon-head"><div><strong>Xem lại: ' + esc(group.label) + '</strong><span>' + group.files.length + ' file của dịch vụ này.</span></div></div><div class="addon-result-grid">';
          group.files.forEach(function (item, previewIndex) {
            html += '<figure class="addon-result-file"><img src="' + escAttr(item.dataUrl) + '" alt="' + escAttr(item.name || item.kind) + '"><figcaption>' + esc(addonPreviewFileLabel(item, previewIndex)) + '</figcaption></figure>';
          });
          html += '</div></div>';
        });
      }
      var selectedSlots = items.reduce(function (total, item) { return total + (item.slots || []).filter(function (slot) { return slot.src; }).length; }, 0);
      var addonExpired = addonSubmissionExpired();
      var addonDisabled = addonState.busy || addonExpired;
      html += '<div class="addon-card"><div class="addon-head"><div><strong>Kiểm tra trước khi gửi</strong><span>' + (addonExpired ? addonSubmissionMessage() : ('Đã chọn ' + selectedSlots + ' slot. Có thể gửi ngay khi chưa ghép đủ; các slot còn thiếu có thể bổ sung sau.')) + '</span></div></div><button class="addon-review-btn" onclick="addonBuildPreviews()" ' + (addonDisabled ? 'disabled' : '') + '>◉ Cập nhật xem lại toàn bộ</button><button class="addon-submit" onclick="addonSubmit()" ' + (addonDisabled ? 'disabled' : '') + '>' + (addonExpired ? 'Đã hết hạn gửi' : (addonState.busy ? 'Đang gửi...' : 'Gửi về thu ngân')) + '</button><div id="addonSubmitProgressWrap" class="sb-submit-progress-wrap" style="display:' + (addonState.busy ? 'block' : 'none') + ';margin-top:12px"><div class="sb-submit-progress-track"><div id="addonSubmitProgressBar" class="sb-submit-progress-fill" style="width:0%"></div></div><div id="addonSubmitProgressText" style="margin-top:6px;color:#766E60;font-size:.78rem;font-weight:900">Đang chuẩn bị...</div></div>';
      if (addonState.message) html += '<div class="sb-download-status">' + esc(addonState.message) + '</div>';
      html += '</div>';
      html += '</div></div>';
      $('ptbContent').innerHTML = html;
      sbNormalizeButtons($('ptbContent'));
      $('ptbContent').style.display = 'block';
      addonScheduleSmallCardPacking();
    }

    function onAddon(res) {
      res = res || {};
      if (res.error) { showE('In thêm', res.error); return; }
      var header = document.querySelector('#ptb-app .ptb-hd');
      var title = document.querySelector('#ptb-app .ptb-hd h1');
      var desc = document.querySelector('#ptb-app .ptb-hd p');
      if (header) header.classList.add('is-selfbooth');
      if (title) title.textContent = 'SELFBOOTH';
      if (desc) desc.textContent = 'Dịch vụ in thêm';
      addonState.manifest = res.manifest || {};
      addonState.services = res.services || addonState.manifest.services || {};
      addonState.submission = res.submission || {};
      if (!Object.keys(addonState.services || {}).length && !addonState.manifest.order_id) {
        showE('In thêm', 'Chưa đọc được dữ liệu đơn in thêm. Vui lòng báo thu ngân bấm làm mới link hoặc kiểm tra deployment web-online.');
        return;
      }
      addonState.sbFrames = res.sbFrames || addonState.manifest.sb_frames || [];
      addonState.ptcardFrames = res.ptcardFrames || addonState.manifest.ptcard_frames || [];
      addonState.keyCardFrames = res.keyCardFrames || addonState.manifest.key_card_frames || [];
      addonInitItems();
      addonRender();
    }

    window.addonActivateItem = function (event, index) {
      var target = event && event.target;
      if (target && target.closest && target.closest('input, button, select, label, [data-addon-slot]')) return;
      if (Number(index) === Number(addonState.activeIndex)) return;
      window.addonSelectItem(index);
    };

    window.addonSelectItem = function (index) {
      addonState.activeIndex = Math.max(0, Math.min(addonState.items.length - 1, Number(index || 0)));
      addonState.activeService = (addonState.items[addonState.activeIndex] || {}).type || addonState.activeService;
      addonState.activeSlotIndex = 0;
      addonRender();
    };

    window.addonSelectService = function (type) {
      var nextIndex = addonState.items.findIndex(function (item) { return item.type === type; });
      if (nextIndex < 0) return;
      addonState.activeService = type;
      addonState.activeIndex = nextIndex;
      addonState.activeSlotIndex = 0;
      addonRender();
    };

    window.addonSelectSlot = function (event, itemIndex, slotIndex) {
      if (event && event.currentTarget && event.currentTarget.getAttribute('data-addon-dragged') === '1') {
        event.currentTarget.removeAttribute('data-addon-dragged');
        event.preventDefault();
        return;
      }
      // Keep the public helper usable from the console and older inline callers.
      if (typeof event !== 'object') {
        slotIndex = itemIndex;
        itemIndex = event;
      }
      addonState.activeIndex = Math.max(0, Math.min(addonState.items.length - 1, Number(itemIndex || 0)));
      var item = addonActiveItem();
      addonState.activeService = item && item.type || addonState.activeService;
      addonState.activeSlotIndex = Math.max(0, Math.min((item && item.slots || []).length - 1, Number(slotIndex || 0)));
      addonRender();
    };

    window.addonSelectFrameForItem = function (itemIndex, frameId) {
      addonState.activeIndex = Math.max(0, Math.min(addonState.items.length - 1, Number(itemIndex || 0)));
      var item = addonActiveItem();
      if (!item) return;
      addonState.activeService = item.type;
      item.frameId = frameId;
      addonSyncItemSlots(item);
      addonRender();
    };

    window.addonSelectFrame = function (frameId) {
      var item = addonActiveItem();
      if (!item) return;
      item.frameId = frameId;
      addonSyncItemSlots(item);
      addonRender();
    };

    function addonUpdateSlotDom(itemIndex, slotIndex) {
      var item = addonState.items[Number(itemIndex || 0)];
      var slot = item && item.slots && item.slots[Number(slotIndex || 0)];
      var definition = item && item.slotDefinitions && item.slotDefinitions[Number(slotIndex || 0)];
      var image = document.querySelector('[data-addon-slot="' + itemIndex + '-' + slotIndex + '"] img');
      if (slot && definition && image) image.style.cssText = addonSlotImageStyle(slot, definition);
    }

    function addonSyncEditorControls() {
      var slot = addonActiveSlot();
      if (!slot) return;
      var zoom = Math.round(Math.max(Number(slot.minZoom || 1), Number(slot.zoom || 1)) * 100);
      var rotate = addonNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '');
      var zoomRange = $('addonZoomRange');
      var zoomValue = $('addonZoomValue');
      var rotateRange = $('addonRotateRange');
      var rotateInput = $('addonRotateInput');
      var rotateValue = $('addonRotateValue');
      if (zoomRange) zoomRange.value = String(zoom);
      if (zoomValue) zoomValue.textContent = zoom + '%';
      if (rotateRange) rotateRange.value = rotate;
      if (rotateInput) rotateInput.value = rotate;
      if (rotateValue) rotateValue.textContent = rotate + '°';
    }

    window.addonRememberSlotImageSize = function (itemIndex, slotIndex, imageEl) {
      var item = addonState.items[Number(itemIndex || 0)];
      var slot = item && item.slots && item.slots[Number(slotIndex || 0)];
      var definition = item && item.slotDefinitions && item.slotDefinitions[Number(slotIndex || 0)];
      if (!slot || !definition || !imageEl) return;
      var width = Number(imageEl.naturalWidth || imageEl.width || 0);
      var height = Number(imageEl.naturalHeight || imageEl.height || 0);
      if (!(width > 0 && height > 0)) return;
      var firstMeasurement = !slot.imgW || !slot.imgH;
      slot.imgW = width;
      slot.imgH = height;
      addonConstrainSlot(slot, definition);
      if (slot.autoFit !== false || firstMeasurement) {
        slot.zoom = Number(slot.minZoom || 1);
        slot.offsetX = 0;
        slot.offsetY = 0;
        slot.autoFit = false;
      }
      addonConstrainSlot(slot, definition);
      addonUpdateSlotDom(itemIndex, slotIndex);
    };

    window.addonPickFile = function (event) {
      if (addonSubmissionExpired()) {
        addonState.message = addonSubmissionMessage();
        addonRender();
        return;
      }
      var file = event && event.target && event.target.files && event.target.files[0];
      var item = addonActiveItem();
      var slot = addonActiveSlot();
      if (!file || !item || !slot) return;
      var reader = new FileReader();
      reader.onload = function () {
        slot.file = file;
        slot.src = String(reader.result || '');
        slot.zoom = 1;
        slot.offsetX = 0;
        slot.offsetY = 0;
        slot.rotate = 0;
        slot.flipX = false;
        slot.autoFit = true;
        slot.imgW = 0;
        slot.imgH = 0;
        slot.minZoom = 1;
        addonState.message = '';
        addonRender();
      };
      reader.readAsDataURL(file);
    };

    window.addonPickSlotFile = function (event, itemIndex, slotIndex) {
      addonState.activeIndex = Number(itemIndex || 0);
      addonState.activeSlotIndex = Number(slotIndex || 0);
      window.addonPickFile(event);
    };

    window.addonSetActiveNumber = function (key, value) {
      var slot = addonActiveSlot();
      if (!slot) return;
      slot[key] = Number(value || 0);
      addonRender();
    };

    window.addonSetZoom = function (value) {
      var slot = addonActiveSlot();
      var item = addonActiveItem();
      var definition = item && item.slotDefinitions && item.slotDefinitions[addonState.activeSlotIndex];
      if (!slot || !definition) return;
      slot.autoFit = false;
      slot.zoom = Math.max(Number(slot.minZoom || 1), Number(value || 100) / 100);
      addonConstrainSlot(slot, definition);
      addonUpdateSlotDom(addonState.activeIndex, addonState.activeSlotIndex);
      addonSyncEditorControls();
    };

    window.addonSetRotate = function (value) {
      var slot = addonActiveSlot();
      var item = addonActiveItem();
      var definition = item && item.slotDefinitions && item.slotDefinitions[addonState.activeSlotIndex];
      if (!slot || !definition) return;
      slot.autoFit = false;
      slot.rotate = Math.max(-180, Math.min(180, Number(value || 0)));
      addonConstrainSlot(slot, definition);
      addonUpdateSlotDom(addonState.activeIndex, addonState.activeSlotIndex);
      addonSyncEditorControls();
    };

    window.addonBumpRotate = function (delta) {
      var slot = addonActiveSlot();
      window.addonSetRotate(Number(slot && slot.rotate || 0) + Number(delta || 0));
    };

    window.addonNudge = function (key, delta) {
      var slot = addonActiveSlot();
      var item = addonActiveItem();
      var definition = item && item.slotDefinitions && item.slotDefinitions[addonState.activeSlotIndex];
      if (!slot || !definition) return;
      slot[key] = Number(slot[key] || 0) + Number(delta || 0);
      slot.autoFit = false;
      addonConstrainSlot(slot, definition);
      addonUpdateSlotDom(addonState.activeIndex, addonState.activeSlotIndex);
      addonSyncEditorControls();
    };

    window.addonResetActive = function () {
      var slot = addonActiveSlot();
      var item = addonActiveItem();
      var definition = item && item.slotDefinitions && item.slotDefinitions[addonState.activeSlotIndex];
      if (!slot || !definition) return;
      slot.zoom = 1; slot.offsetX = 0; slot.offsetY = 0; slot.rotate = 0; slot.flipX = false; slot.autoFit = true;
      addonConstrainSlot(slot, definition);
      slot.zoom = Number(slot.minZoom || 1);
      slot.autoFit = false;
      addonUpdateSlotDom(addonState.activeIndex, addonState.activeSlotIndex);
      addonSyncEditorControls();
    };

    window.addonFlipActive = function () {
      var slot = addonActiveSlot();
      var item = addonActiveItem();
      var definition = item && item.slotDefinitions && item.slotDefinitions[addonState.activeSlotIndex];
      if (!slot || !definition) return;
      slot.flipX = !slot.flipX;
      slot.autoFit = false;
      addonConstrainSlot(slot, definition);
      addonUpdateSlotDom(addonState.activeIndex, addonState.activeSlotIndex);
      addonSyncEditorControls();
    };

    window.addonCloseEditPanel = function () {
      addonState.activeSlotIndex = -1;
      addonRender();
    };

    window.addonClearActive = function () {
      var slot = addonActiveSlot();
      if (!slot) return;
      slot.file = null; slot.src = ''; slot.zoom = 1; slot.offsetX = 0; slot.offsetY = 0; slot.rotate = 0; slot.flipX = false; slot.autoFit = true; slot.imgW = 0; slot.imgH = 0; slot.minZoom = 1;
      addonRender();
    };

    function addonGesturePointList(itemIndex, slotIndex) {
      return Object.keys(addonGesturePointers).map(function (key) { return addonGesturePointers[key]; }).filter(function (point) {
        return point && point.itemIndex === itemIndex && point.slotIndex === slotIndex;
      });
    }

    function addonGestureDistance(a, b) {
      var dx = Number(a.clientX || 0) - Number(b.clientX || 0);
      var dy = Number(a.clientY || 0) - Number(b.clientY || 0);
      return Math.max(1, Math.sqrt(dx * dx + dy * dy));
    }

    function addonGestureCenter(a, b) {
      return {
        x: (Number(a.clientX || 0) + Number(b.clientX || 0)) / 2,
        y: (Number(a.clientY || 0) + Number(b.clientY || 0)) / 2
      };
    }

    function addonStartPinchGesture(itemIndex, slotIndex, target) {
      var points = addonGesturePointList(itemIndex, slotIndex);
      var item = addonState.items[itemIndex];
      var slot = item && item.slots && item.slots[slotIndex];
      if (points.length < 2 || !slot) return false;
      var box = target.getBoundingClientRect();
      var center = addonGestureCenter(points[0], points[1]);
      addonDragState = {
        mode: 'pinch', itemIndex: itemIndex, slotIndex: slotIndex, target: target, dragging: true,
        boxW: Math.max(1, box.width), boxH: Math.max(1, box.height),
        startDistance: addonGestureDistance(points[0], points[1]), startCenterX: center.x, startCenterY: center.y,
        startZoom: Number(slot.zoom || 1), offsetX: Number(slot.offsetX || 0), offsetY: Number(slot.offsetY || 0)
      };
      return true;
    }

    window.addonStartSlotDrag = function (event, itemIndex, slotIndex) {
      if (!event || event.button !== undefined && event.button !== 0) return;
      itemIndex = Number(itemIndex || 0);
      slotIndex = Number(slotIndex || 0);
      var item = addonState.items[itemIndex];
      var slot = item && item.slots && item.slots[slotIndex];
      var definition = item && item.slotDefinitions && item.slotDefinitions[slotIndex];
      if (!item || !slot || !definition || !slot.src) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      addonState.activeIndex = itemIndex;
      addonState.activeService = item.type;
      addonState.activeSlotIndex = slotIndex;
      var layer = event.currentTarget;
      var box = layer.getBoundingClientRect();
      addonGesturePointers[event.pointerId] = { pointerId: event.pointerId, itemIndex: itemIndex, slotIndex: slotIndex, clientX: event.clientX, clientY: event.clientY };
      try { layer.setPointerCapture(event.pointerId); } catch (e) {}
      if (addonStartPinchGesture(itemIndex, slotIndex, layer)) return;
      addonDragState = {
        mode: 'drag', itemIndex: itemIndex, slotIndex: slotIndex, pointerId: event.pointerId, target: layer, dragging: false,
        startX: event.clientX, startY: event.clientY, boxW: Math.max(1, box.width), boxH: Math.max(1, box.height),
        offsetX: Number(slot.offsetX || 0), offsetY: Number(slot.offsetY || 0)
      };
    };

    window.addEventListener('pointermove', function (event) {
      if (addonGesturePointers[event.pointerId]) {
        addonGesturePointers[event.pointerId].clientX = event.clientX;
        addonGesturePointers[event.pointerId].clientY = event.clientY;
      }
      if (!addonDragState) return;
      var state = addonDragState;
      var item = addonState.items[state.itemIndex];
      var slot = item && item.slots && item.slots[state.slotIndex];
      var definition = item && item.slotDefinitions && item.slotDefinitions[state.slotIndex];
      if (!slot || !definition) return;
      if (state.mode === 'pinch') {
        var points = addonGesturePointList(state.itemIndex, state.slotIndex);
        if (points.length < 2) return;
        if (event.cancelable) event.preventDefault();
        var center = addonGestureCenter(points[0], points[1]);
        var ratio = addonGestureDistance(points[0], points[1]) / Math.max(1, Number(state.startDistance || 1));
        slot.autoFit = false;
        var minZoom = addonMinFillZoom(slot, definition);
        var maxZoom = Math.max(2.6, minZoom + 1.6);
        slot.zoom = Math.max(minZoom, Math.min(maxZoom, Number(state.startZoom || 1) * ratio));
        slot.offsetX = Number(state.offsetX || 0) + ((center.x - Number(state.startCenterX || center.x)) / state.boxW) * 100;
        slot.offsetY = Number(state.offsetY || 0) + ((center.y - Number(state.startCenterY || center.y)) / state.boxH) * 100;
        addonConstrainSlot(slot, definition);
        addonUpdateSlotDom(state.itemIndex, state.slotIndex);
        return;
      }
      if (state.pointerId !== event.pointerId) {
        addonStartPinchGesture(state.itemIndex, state.slotIndex, state.target);
        return;
      }
      var dx = Number(event.clientX || 0) - Number(state.startX || 0);
      var dy = Number(event.clientY || 0) - Number(state.startY || 0);
      if (!state.dragging) {
        if (Math.sqrt(dx * dx + dy * dy) < 8) return;
        state.dragging = true;
        try { state.target.setPointerCapture(state.pointerId); } catch (e) {}
      }
      if (event.cancelable) event.preventDefault();
      slot.autoFit = false;
      slot.offsetX = Number(state.offsetX || 0) + (dx / state.boxW) * 100;
      slot.offsetY = Number(state.offsetY || 0) + (dy / state.boxH) * 100;
      addonConstrainSlot(slot, definition);
      addonUpdateSlotDom(state.itemIndex, state.slotIndex);
    });

    function addonFinishSlotDrag(event) {
      var state = addonDragState;
      var didMove = Boolean(state && state.dragging);
      var itemIndex = state && state.itemIndex;
      var slotIndex = state && state.slotIndex;
      delete addonGesturePointers[event.pointerId];
      if (state && itemIndex !== undefined && slotIndex !== undefined && addonGesturePointList(itemIndex, slotIndex).length === 1) {
        var point = addonGesturePointList(itemIndex, slotIndex)[0];
        var item = addonState.items[itemIndex];
        var slot = item && item.slots && item.slots[slotIndex];
        var target = state.target;
        if (slot && target) {
          var box = target.getBoundingClientRect();
          addonDragState = {
            mode: 'drag', itemIndex: itemIndex, slotIndex: slotIndex, pointerId: point.pointerId, target: target, dragging: false,
            startX: point.clientX, startY: point.clientY, boxW: Math.max(1, box.width), boxH: Math.max(1, box.height),
            offsetX: Number(slot.offsetX || 0), offsetY: Number(slot.offsetY || 0)
          };
          return;
        }
      }
      addonDragState = null;
      if (didMove) {
        // Browsers fire click after pointerup. Mark it so the click does not
        // re-render the composer after a drag/pinch and make the page jump.
        if (state && state.target) state.target.setAttribute('data-addon-dragged', '1');
        addonSyncEditorControls();
      }
    }

    window.addEventListener('pointerup', addonFinishSlotDrag);
    window.addEventListener('pointercancel', function (event) {
      var didMove = Boolean(addonDragState && addonDragState.dragging);
      delete addonGesturePointers[event.pointerId];
      addonDragState = null;
      if (didMove) addonSyncEditorControls();
    });

    window.addonShowHelp = function () {
      var modal = document.createElement('div');
      modal.className = 'sb-help-backdrop';
      modal.innerHTML = '<div class="sb-help-modal"><div class="sb-help-modal-head"><h3>Hướng dẫn in thêm</h3><button class="sb-help-close">×</button></div><div class="sb-help-modal-body"><div class="sb-help-item"><i>1</i><div><strong>Tải ảnh</strong><span>Bấm tải ảnh trong từng mục dịch vụ.</span></div></div><div class="sb-help-item"><i>2</i><div><strong>Chọn frame</strong><span>Chọn mẫu và chỉnh zoom, xoay, vị trí cho vừa frame.</span></div></div><div class="sb-help-item"><i>3</i><div><strong>Gửi về thu ngân</strong><span>Hệ thống lưu file kết quả vào Drive của đơn in thêm.</span></div></div></div></div>';
      ($('ptb-app') || document.body).appendChild(modal);
      modal.onclick = function (event) { if (event.target === modal) modal.remove(); };
      modal.querySelector('.sb-help-close').onclick = function () { modal.remove(); };
    };

    function addonDrawSlotPhoto(ctx, img, definition, itemWidth, itemHeight, slot) {
      addonConstrainSlot(slot, definition);
      var w = Number(definition.w || itemWidth);
      var h = Number(definition.h || itemHeight);
      var cover = Math.max(w / img.width, h / img.height) * Number(slot.zoom || 1);
      var dw = img.width * cover;
      var dh = img.height * cover;
      ctx.save();
      ctx.translate(Number(definition.x || 0) + w / 2, Number(definition.y || 0) + h / 2);
      ctx.rotate(Number(definition.rotate || 0) * Math.PI / 180);
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.clip();
      ctx.translate((Number(slot.offsetX || 0) / 100) * w, (Number(slot.offsetY || 0) / 100) * h);
      ctx.rotate(Number(slot.rotate || 0) * Math.PI / 180);
      if (slot.flipX) ctx.scale(-1, 1);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    function addonRenderItem(item, options) {
      options = options || {};
      var frame = addonFrameById(item.type, item.frameId);
      if (!frame) return Promise.reject(new Error('Thiếu frame cho ' + addonServiceLabel(item.type)));
      var w = Number(frame.width || (item.type === 'cd' ? 1417 : 1200));
      var h = Number(frame.height || (item.type === 'cd' ? 1417 : 1800));
      var frameUrl = addonFrameUrl(frame);
      var definitions = item.slotDefinitions || addonFrameSlots(frame, item.type);
      var selectedSlots = (item.slots || []).map(function (slot, index) { return { slot: slot, definition: definitions[index] }; }).filter(function (entry) { return entry.slot && entry.slot.src && entry.definition; });
      if (!selectedSlots.length) return Promise.resolve(null);
      return Promise.all(selectedSlots.map(function (entry) { return loadImageForCanvas(entry.slot.src); }).concat(frameUrl ? [loadImageForCanvas(frameUrl)] : [])).then(function (images) {
        var overlay = frameUrl ? images[images.length - 1] : null;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fffdf8';
        ctx.fillRect(0, 0, w, h);
        selectedSlots.forEach(function (entry, index) {
          addonDrawSlotPhoto(ctx, images[index], entry.definition, w, h, entry.slot);
        });
        if (overlay) ctx.drawImage(overlay, 0, 0, w, h);
        return {
          kind: item.type,
          service: item.type,
          side: options.side || 'front',
          item: item.index,
          preset: frame.id || '',
          name: (options.name || ('addon_' + item.type + '_' + (item.index + 1) + '.jpg')),
          w: w,
          h: h,
          dataUrl: canvas.toDataURL('image/jpeg', .94)
        };
      });
    }

    function addonRenderPtcardBack(item) {
      var frame = addonFrameById(item.type, item.frameId);
      var backUrl = frame && frame.backUrl;
      if (!frame || !backUrl) return Promise.resolve(null);
      return loadImageForCanvas(backUrl).then(function (overlay) {
        var w = Number(frame.width || 2055), h = Number(frame.height || 1299);
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fffdf8'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(overlay, 0, 0, w, h);
        return { kind: item.type, service: item.type, side: 'back', item: item.index, preset: frame.id || '', name: 'addon_ptcard_' + (item.index + 1) + '_back.jpg', w: w, h: h, dataUrl: canvas.toDataURL('image/jpeg', .94) };
      });
    }

    function addonRenderKeyCardSheets(cards) {
      var keyCards = cards.filter(function (card) { return card && card.kind === 'key_card'; });
      var jobs = [];
      for (var start = 0; start < keyCards.length; start += 4) {
        (function (group, sheetIndex) {
          jobs.push(Promise.all(group.map(function (card) { return loadImageForCanvas(card.dataUrl); })).then(function (images) {
            var canvas = document.createElement('canvas');
            canvas.width = 1200; canvas.height = 1800;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            images.forEach(function (img, index) {
              var rowH = canvas.height / 4;
              var rotatedW = img.height;
              var rotatedH = img.width;
              var maxW = canvas.width * .94;
              var maxH = rowH * .9;
              var scale = Math.min(maxW / rotatedW, maxH / rotatedH);
              var dw = img.width * scale;
              var dh = img.height * scale;
              var cx = canvas.width / 2;
              var cy = index * rowH + rowH / 2;
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
              ctx.restore();
            });
            return { kind: 'key_card_sheet', service: 'key_card', sheet: sheetIndex, name: 'addon_key_card_sheet_' + (sheetIndex + 1) + '.jpg', w: canvas.width, h: canvas.height, dataUrl: canvas.toDataURL('image/jpeg', .94) };
          }));
        })(keyCards.slice(start, start + 4), Math.floor(start / 4));
      }
      return Promise.all(jobs);
    }

    function addonSetSubmitProgress(percent, message, isError) {
      percent = Math.max(0, Math.min(100, Math.round(Number(percent || 0))));
      var wrap = $('addonSubmitProgressWrap');
      var bar = $('addonSubmitProgressBar');
      var text = $('addonSubmitProgressText');
      if (wrap) wrap.style.display = 'block';
      if (bar) {
        bar.style.width = percent + '%';
        bar.style.background = isError ? '#B4534F' : '#536048';
      }
      if (text) {
        text.style.color = isError ? '#B4534F' : '#766E60';
        text.innerHTML = isError || percent >= 100
          ? esc(message || 'Đã xong.')
          : esc(message || 'Đang tải...') + ' <span class="sb-loading-dots"></span><div style="font-size:.72rem;color:#766E60;margin-top:3px">Đừng tắt màn hình. Kết quả in sẽ được gửi tới thu ngân trước.</div>';
      }
    }

    function addonSetSubmitBusy(disabled, label) {
      Array.prototype.forEach.call(document.querySelectorAll('#ptb-app .addon-submit, #ptb-app .addon-review-btn'), function (button) {
        button.disabled = Boolean(disabled);
      });
      var submit = document.querySelector('#ptb-app .addon-submit');
      if (submit && label) submit.textContent = label;
    }

    function addonCollectCustomUploads() {
      var uploads = [];
      addonState.items.forEach(function (item) {
        (item.slots || []).forEach(function (slot, slotIndex) {
          if (!slot || !slot.file || !slot.src) return;
          uploads.push({
            kind: 'custom_upload', service: item.type, side: 'source', item: item.index,
            slot: slotIndex, name: slot.file.name || ('anh_goc_' + (slotIndex + 1) + '.jpg'),
            w: Number(slot.imgW || 0), h: Number(slot.imgH || 0), dataUrl: slot.src
          });
        });
      });
      return uploads;
    }

    window.addonBuildPreviews = function () {
      if (addonSubmissionExpired()) {
        addonState.message = addonSubmissionMessage();
        addonRender();
        return Promise.resolve([]);
      }
      addonState.busy = true;
      addonState.resultsDelivered = false;
      addonState.resultsTelegramNotified = false;
      addonState.message = 'Đang dựng preview...';
      addonRender();
      addonSetSubmitProgress(8, 'Đang dựng file kết quả in...');
      var jobs = [];
      addonState.items.forEach(function (item) {
        if (!(item.slots || []).some(function (slot) { return slot.src; })) return;
        jobs.push(addonRenderItem(item, { name: 'addon_' + item.type + '_' + (item.index + 1) + '_front.jpg' }));
        if (item.type === 'ptcard') jobs.push(addonRenderPtcardBack(item));
      });
      return Promise.all(jobs).then(function (results) {
        results = results.filter(Boolean);
        return addonRenderKeyCardSheets(results).then(function (sheets) {
          addonState.previews = results.concat(sheets || []);
          addonState.message = addonState.previews.length ? 'Đã tạo preview. Kiểm tra rồi bấm gửi về thu ngân.' : 'Chưa có ảnh nào để ghép.';
          addonState.busy = false;
          addonRender();
          return addonState.previews;
        });
      }).catch(function (err) {
        addonState.busy = false;
        addonState.message = err.message || 'Không dựng được preview.';
        addonRender();
        throw err;
      });
    };

    function addonPostPayloadWithRetry(payload, attempts) {
      attempts = Math.max(1, Number(attempts || 3));
      var current = 0;
      function run() {
        current += 1;
        return postSbPayload(payload).catch(function (err) {
          if (current >= attempts) throw err;
          addonState.message = 'Upload chưa ổn, đang thử lại lần ' + (current + 1) + '/' + attempts + '...';
          addonSetSubmitProgress(0, addonState.message);
          return new Promise(function (resolve) {
            window.setTimeout(resolve, 1200 + current * 900);
          }).then(run);
        });
      }
      return run();
    }

    window.addonSubmit = function () {
      if (addonSubmissionExpired()) {
        addonState.message = addonSubmissionMessage();
        addonRender();
        return;
      }
      var selectedCount = addonState.items.reduce(function (total, item) {
        return total + (item.slots || []).filter(function (slot) { return slot.src; }).length;
      }, 0);
      if (!selectedCount) {
        addonState.message = 'Hãy tải ít nhất 1 ảnh để gửi lượt này. Các mục còn thiếu có thể gửi bổ sung sau.';
        addonRender();
        return;
      }
      addonState.busy = true;
      addonState.message = 'Đang tạo file kết quả cho ' + selectedCount + ' slot...';
      addonRender();
      addonSetSubmitProgress(4, 'Đang tạo file kết quả in...');
      addonBuildPreviews().then(function (files) {
        if (!files.length) throw new Error('Chưa có file kết quả để gửi.');
        addonState.busy = true;
        addonRender();
        addonSetSubmitProgress(25, 'Đang gửi file kết quả về thu ngân...');
        var jobId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var createdAt = new Date().toISOString();
        var selectionPayload = addonState.items.map(function (item) {
          return {
            type: item.type,
            index: item.index,
            frameId: item.frameId,
            slots: (item.slots || []).map(function (slot, slotIndex) {
              return {
                index: slotIndex,
                label: slot.label || '',
                zoom: slot.zoom,
                offsetX: slot.offsetX,
                offsetY: slot.offsetY,
                rotate: slot.rotate,
                flipX: Boolean(slot.flipX),
                name: slot.file && slot.file.name || ''
              };
            })
          };
        });
        var serviceSummary = (addonState.manifest.items || []).map(function (item) { return (item.label || item.type) + ' x' + item.qty; }).join(', ');
        var customUploads = addonCollectCustomUploads();
        var chain = Promise.resolve(null);
        files.forEach(function (file, index) {
          chain = chain.then(function () {
            var progress = 25 + Math.round(((index + 1) / files.length) * 45);
            addonState.message = 'Đang gửi kết quả in ' + (index + 1) + '/' + files.length + '...';
            addonSetSubmitProgress(progress, addonState.message);
            var payload = {
              action: 'submitAddonPrint',
              folderId: fid,
              jobId: jobId,
              pageUrl: window.location.href,
              createdAt: createdAt,
              expectedFileCount: files.length,
              expectedCustomUploadCount: customUploads.length,
              chunkIndex: index,
              isFinal: index === files.length - 1,
              serviceSummary: serviceSummary,
              selections: selectionPayload,
              files: [Object.assign({}, file, { globalIndex: index })]
            };
            return addonPostPayloadWithRetry(payload, 3);
          });
        });
        return chain.then(function (result) {
          addonState.resultsDelivered = Boolean(result && result.ok !== false);
          addonState.resultsTelegramNotified = Boolean(result && result.telegramNotified);
          addonState.message = result && result.telegramNotified
            ? 'Kết quả in đã gửi và đã báo Telegram. Đang lưu ảnh gốc...'
            : 'Kết quả in đã gửi. Đang lưu ảnh gốc...';
          addonSetSubmitProgress(75, addonState.message);
          var customChain = Promise.resolve(null);
          customUploads.forEach(function (file, customIndex) {
            customChain = customChain.then(function () {
              var progress = 75 + Math.round(((customIndex + 1) / Math.max(1, customUploads.length)) * 22);
              addonSetSubmitProgress(progress, 'Đang lưu ảnh gốc ' + (customIndex + 1) + '/' + customUploads.length + '...');
              return addonPostPayloadWithRetry({
                action: 'submitAddonPrint',
                folderId: fid,
                jobId: jobId,
                pageUrl: window.location.href,
                createdAt: createdAt,
                expectedFileCount: files.length,
                expectedCustomUploadCount: customUploads.length,
                chunkIndex: files.length + customIndex,
                isFinal: false,
                serviceSummary: serviceSummary,
                selections: selectionPayload,
                customFiles: [file]
              }, 3);
            });
          });
          return customChain.then(function () { return result; });
        });
      }).then(function (result) {
        addonState.busy = false;
        addonState.message = result && result.telegramNotified
          ? 'Đã gửi thành công và đã báo Telegram cho thu ngân.'
          : 'Đã gửi thành công. Thu ngân sẽ kiểm tra file in.';
        addonSetSubmitProgress(100, addonState.message);
        addonSetSubmitBusy(false, 'Gửi về thu ngân');
      }).catch(function (err) {
        addonState.busy = false;
        addonState.message = addonState.resultsDelivered
          ? ((addonState.resultsTelegramNotified ? 'Kết quả in đã gửi và đã báo Telegram. ' : 'Kết quả in đã gửi. ') + 'Ảnh gốc chưa lưu xong: ' + ((err && err.message) || 'vui lòng gửi lại.'))
          : ((err && err.message) || 'Không gửi được. Vui lòng thử lại.');
        addonSetSubmitProgress(0, addonState.message, true);
        addonSetSubmitBusy(false, 'Gửi lại');
      });
    };

    function onViewerData(res) {
      warmSharingPreview(res);
      if (mode === 'addon' || (res && res.mode === 'addon')) {
        if (res) res.mode = 'addon';
        onAddon(res);
        return;
      }
      if (res && res.mode === 'sb') {
        onSb(res);
        return;
      }
      onD(res);
    }

    function ptbShareCardHtml(extraClass) {
      var pageUrl = window.location.href;
      var cls = extraClass ? ' ' + extraClass : '';
      var shareUrl = encodeURIComponent(pageUrl);
      var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?data=' + shareUrl + '&size=160x160&color=536048';
      var h = '';
      h += '<div class="ptb-share-card' + cls + '">';
      h += '<div class="ptb-share-title">Chia sẻ trang ảnh</div>';
      h += '<div class="ptb-share-actions">';
      h += '<button type="button" onclick="ptbCopyShareLink(this)" class="ptb-share-btn">Copy link</button>';
      h += '<a href="https://www.facebook.com/sharer/sharer.php?u=' + shareUrl + '" target="_blank" rel="noopener" class="ptb-share-btn fb">Facebook</a>';
      h += '<a href="https://zalo.me/share?url=' + shareUrl + '" target="_blank" rel="noopener" class="ptb-share-btn zalo">Zalo</a>';
      h += '</div>';
      h += '<div class="ptb-share-qr">Quét QR để mở lại trang này<img src="' + qrUrl + '" alt="QR chia sẻ"></div>';
      h += '</div>';
      return h;
    }

    window.ptbCopyShareLink = function (btnEl) {
      var text = window.location.href;
      var original = btnEl ? btnEl.textContent : '';
      function done(ok) {
        if (!btnEl) return;
        btnEl.textContent = ok ? 'Đã copy' : 'Không copy được';
        setTimeout(function () { btnEl.textContent = original || 'Copy link'; }, 1400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(false); });
        return;
      }
      try {
        var input = document.createElement('input');
        input.value = text;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(input);
        done(ok);
      } catch (err) {
        done(false);
      }
    };

    function sbIsViewerImage(f) {
      if (!f) return false;
      var name = String(f.name || '').toLowerCase();
      var category = String(f.category || '').toLowerCase();
      var mime = String(f.mimeType || f.mime || '').toLowerCase();
      if (category === 'image' || category === 'photo' || category === 'photos' || category === 'jpg' || category === 'original') return true;
      if (category && /(card|video|timelapse|manifest|metadata|json|submitted)/.test(category)) return false;
      if (mime.indexOf('image/') === 0) return !/\.(json|xmp|raw|cr2|cr3)$/i.test(name);
      return /\.(jpe?g|png|webp|heic|heif)$/i.test(name) && !/(card|submitted|manifest|metadata)/i.test(name);
    }

    function sbCaptureNumber(file) {
      var stt = Number(file && file.stt);
      if (isFinite(stt) && stt > 0) return stt;
      var name = String((file && file.name) || '');
      var matches = name.match(/\d+/g);
      if (!matches || !matches.length) return 999999999;
      return Number(matches[matches.length - 1]) || 999999999;
    }

    function sbSortImages(a, b) {
      var numDiff = sbCaptureNumber(a) - sbCaptureNumber(b);
      if (numDiff !== 0) return numDiff;
      return sbTimeToMs((a && (a.dateCreated || a.createdAt || a.created_at)) || 0) - sbTimeToMs((b && (b.dateCreated || b.createdAt || b.created_at)) || 0);
    }

    function sbCollectViewerImages(res) {
      var pool = [];
      if (res && Array.isArray(res.images)) pool = pool.concat(res.images);
      if (res && Array.isArray(res.files)) pool = pool.concat(res.files);
      var seen = {};
      return pool.filter(function (f) {
        if (!sbIsViewerImage(f)) return false;
        var key = String(f.id || f.fileId || f.name || '');
        if (key && seen[key]) return false;
        if (key) seen[key] = true;
        return true;
      }).sort(sbSortImages);
    }

    function sbTimeToMs(value) {
      if (value === null || value === undefined || value === '') return 0;
      if (typeof value === 'number') return value < 10000000000 ? value * 1000 : value;
      var raw = String(value || '').trim();
      if (!raw) return 0;
      if (/^\d+$/.test(raw)) {
        var n = Number(raw);
        return n < 10000000000 ? n * 1000 : n;
      }
      var parsed = Date.parse(raw);
      return isNaN(parsed) ? 0 : parsed;
    }

    function sbFindEditStartTime(res) {
      var manifest = (res && res.manifest) || {};
      var firstImageMs = 0;
      sbCollectViewerImages(res).forEach(function (f) {
        var ms = sbTimeToMs(f.dateCreated || f.createdAt || f.created_at);
        if (ms && (!firstImageMs || ms < firstImageMs)) firstImageMs = ms;
      });
      if (firstImageMs) return firstImageMs;
      var candidates = [
        res && (res.createdAt || res.created_at || res.startedAt || res.started_at || res.dateCreated),
        manifest.createdAt,
        manifest.created_at,
        manifest.startedAt,
        manifest.started_at,
        manifest.sessionCreatedAt,
        manifest.session_created_at,
        manifest.dateCreated
      ];
      var best = 0;
      candidates.forEach(function (value) {
        var ms = sbTimeToMs(value);
        if (ms && (!best || ms < best)) best = ms;
      });
      return best;
    }

    function sbSetupEditWindow(res, allowReplace) {
      var start = sbFindEditStartTime(res);
      if (start && (allowReplace || !sbEditWindowFromData || !sbEditExpiresAt)) {
        sbCaptureStartedAt = start;
        sbEditExpiresAt = start + SB_EDIT_WINDOW_MS;
        sbEditWindowFromData = true;
        return;
      }
      if (start && !sbCaptureStartedAt) sbCaptureStartedAt = start;
      if (!sbEditExpiresAt) {
        sbCaptureStartedAt = Date.now();
        sbEditExpiresAt = sbCaptureStartedAt + SB_EDIT_WINDOW_MS;
        sbEditWindowFromData = false;
      }
    }

    function sbStorageNoticeHtml() {
      var capturedAt = sbCaptureStartedAt || (sbEditExpiresAt ? sbEditExpiresAt - SB_EDIT_WINDOW_MS : 0);
      if (!capturedAt) return '';
      var saveBefore = capturedAt + 14 * 86400000;
      return '<div style="background:#F7F1E4;border:1px solid #DDE4D3;border-radius:14px;padding:12px 14px;margin:4px 0 4px;display:flex;align-items:center;gap:10px;font-size:.8rem;color:#536048;font-weight:800;line-height:1.45"><span style="font-size:1.15rem">⏳</span><span>Ảnh của bạn được chụp lúc <b>' + fDate(capturedAt) + '</b>. Vui lòng tải xuống để lưu trữ trước <b>' + fDate(saveBefore).split(" ")[1] + '</b> nhé!</span></div>';
    }

    function sbRefreshStorageNotice() {
      var notice = $('sbStorageNotice');
      if (notice) notice.innerHTML = sbStorageNoticeHtml();
    }

    function sbIsEditExpired() {
      return Boolean(sbEditExpiresAt && Date.now() >= sbEditExpiresAt);
    }

    function sbFormatCountdown(ms) {
      ms = Math.max(0, Number(ms || 0));
      var total = Math.ceil(ms / 1000);
      var hh = Math.floor(total / 3600);
      var mm = Math.floor((total % 3600) / 60);
      var ss = total % 60;
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    }

    function sbFormatClock(ms) {
      if (!ms) return '';
      var d = new Date(ms);
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    function sbFormatRemainingLong(ms) {
      ms = Math.max(0, Number(ms || 0));
      var totalHours = Math.floor(ms / 3600000);
      var days = Math.floor(totalHours / 24);
      var hours = totalHours % 24;
      var parts = [];
      if (days > 0) parts.push(days + ' ngày');
      if (hours > 0 || !parts.length) parts.push(hours + ' giờ');
      return parts.join(' ');
    }

    function sbEditExpiredMessage() {
      return 'Đã hết 3 ngày chỉnh ảnh. Bạn vẫn xem ảnh và tải ảnh gốc trong Drive, nhưng không thể ghép frame hoặc gửi card mới.';
    }

    function sbUpdateEditCountdown() {
      if (!sbEditExpiresAt) return;
      var expired = sbIsEditExpired();
      var remaining = Math.max(0, sbEditExpiresAt - Date.now());
      var countdownMode = remaining <= SB_EDIT_COUNTDOWN_WINDOW_MS;
      var longText = sbFormatRemainingLong(remaining);
      var value = $('sbCountdownValue');
      var note = $('sbCountdownNote');
      var card = $('sbCountdownCard');
      var frameBtn = $('sbTabBtnFrame');
      var submit = $('sbFloatingSubmit');
      var panel = $('sbEditPanel');
      if (value) value.textContent = expired ? 'Hết giờ' : (countdownMode ? sbFormatCountdown(remaining) : longText);
      if (note) note.textContent = expired ? sbEditExpiredMessage() : (countdownMode ? ('Còn ' + sbFormatCountdown(remaining) + ' đến hết hạn lúc ' + sbFormatClock(sbEditExpiresAt) + '. Sau thời gian này trang chỉ còn xem ảnh và tải Drive.') : ('Còn ' + longText + '.'));
      if (card) {
        card.style.borderColor = expired ? '#C8D0BD' : '#DED2BD';
        card.style.background = expired ? '#FCFAF5' : '#FCFAF5';
      }
      if (frameBtn) {
        frameBtn.disabled = expired;
        frameBtn.title = expired ? sbEditExpiredMessage() : 'Tải ảnh đã chỉnh lên slot, zoom/check, rồi gửi về thu ngân trong vòng 3 ngày.';
        if (expired) frameBtn.className = 'sb-tab';
      }
      if (expired) {
        sbEditPanelOpen = false;
        sbPickerSlot = -1;
        if (panel) panel.style.display = 'none';
        if (panel && panel.parentNode) {
          panel.parentNode.style.display = 'none';
          if (panel.parentNode.classList) panel.parentNode.classList.remove('is-open');
        }
        if (submit) submit.style.display = 'none';
        if (sbTab === 'frame') {
          sbTab = 'gallery';
          sbSyncTabs();
        }
      } else if (submit) {
        var currentSlot = sbSlots[sbActive];
        var panelVisible = Boolean(sbEditPanelOpen && currentSlot && currentSlot.src && sbTab === 'frame');
        submit.style.display = panelVisible ? 'none' : '';
      }
    }

    function sbStartEditCountdown() {

      if (sbCountdownTimer) window.clearInterval(sbCountdownTimer);
      sbUpdateEditCountdown();
      sbCountdownTimer = window.setInterval(sbUpdateEditCountdown, 1000);
    }

    function sbRequireEditOpen() {
      sbUpdateEditCountdown();
      if (!sbIsEditExpired()) return true;
      sbTab = 'gallery';
      sbEditPanelOpen = false;
      sbPickerSlot = -1;
      sbSyncControls();
      sbShowHelpModal('Hết giờ chỉnh ảnh', [
        ['1', 'Đã hết thời gian ghép frame', sbEditExpiredMessage()],
        ['2', 'Bạn vẫn xem và tải ảnh', 'Mở tab Tải ảnh để xem lớn từng ảnh hoặc bấm Tải tất cả trong Drive.']
      ]);
      return false;
    }

    function sbCloseHelpModal() {

      var modal = $('sbHelpModal');
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }

    function sbHelpItemsHtml(items) {
      return items.map(function (item) {
        return '<div class="sb-help-item"><i>' + esc(item[0]) + '</i><div><strong>' + esc(item[1]) + '</strong><span>' + esc(item[2]) + '</span></div></div>';
      }).join('');
    }

    function sbShowHelpModal(title, items) {
      sbCloseHelpModal();
      var modal = document.createElement('div');
      modal.id = 'sbHelpModal';
      modal.className = 'sb-help-backdrop';
      modal.innerHTML = '<div class="sb-help-modal" role="dialog" aria-modal="true" aria-label="' + escAttr(title || 'SelfBooth') + '"><div class="sb-help-modal-head"><h3>' + esc(title || 'Hướng dẫn SelfBooth') + '</h3><button class="sb-help-close" type="button" onclick="sbCloseHelpModal()" title="Đóng">x</button></div><div class="sb-help-modal-body">' + sbHelpItemsHtml(items || []) + '</div></div>';
      modal.onclick = function (event) {
        if (event.target === modal) sbCloseHelpModal();
      };
      ($('ptb-app') || document.body).appendChild(modal);
    }

    window.sbCloseHelpModal = sbCloseHelpModal;
    window.sbShowSelfBoothHelp = function () {
      var expired = sbIsEditExpired();
      sbShowHelpModal('Hướng dẫn SelfBooth', [
        ['1', 'Tải ảnh gốc', 'Ở tab Tải ảnh, chạm ảnh để xem lớn bằng gallery hoặc bấm Tải tất cả trong Drive để tải trọn bộ.'],
        ['2', 'Ghép frame', expired ? 'Đã hết 3 ngày chỉnh ảnh nên tab Ghép frame đã khóa.' : 'Trong 3 ngày, vào tab Ghép frame để tải ảnh đã chỉnh lên từng slot, zoom/check rồi gửi về thu ngân. 6 giờ cuối sẽ hiện đếm ngược.'],
        ['3', 'Sau khi hết giờ', 'Trang chỉ còn chế độ xem ảnh và tải Drive, không thể ghép frame hoặc gửi card mới.']
      ]);
    };

    function onSb(res) {

      hide('ptbLoading');
      if (res.error) { showE('SelfBooth', res.error); return; }
      if (sbCountdownTimer) window.clearInterval(sbCountdownTimer);
      sbCountdownTimer = null;
      sbEditExpiresAt = 0;
      sbCaptureStartedAt = 0;
      sbEditWindowFromData = false;
      var sbManifest = res.manifest || {};
      sbSessionFolderId = res.session_folder_id || res.sessionFolderId || res.root_folder_id || res.rootFolderId || fid;
      sbDownloadFolderId = res.public_folder_id || res.publicFolderId || res.photos_folder_id || res.photosFolderId || sbManifest.public_folder_id || sbManifest.publicFolderId || sbManifest.photos_folder_id || sbManifest.photosFolderId || fid;
      sbDownloadDriveUrl = 'https://drive.google.com/drive/folders/' + encodeURIComponent(sbDownloadFolderId);
      sbKeyCode = res.code || res.key || sbManifest.code || sbManifest.key || sbKeyCode || '';
      sbCustomerName = res.customer_name || res.customerName || sbManifest.customer_name || sbManifest.customerName || sbCustomerName || '';
      sbCustomerPhone = res.customer_phone || res.customerPhone || sbManifest.customer_phone || sbManifest.customerPhone || sbCustomerPhone || '';
      sbApplyFramePresetsFromPayload(res);
      sbApplyPtcardPresetsFromPayload(res);
      sbViewerPackage = sbNormalizePackage(res.package || (res.manifest && (res.manifest.package || res.manifest.sb_package)) || '');
      sbPrintCount = sbNormalizePrintCount(res.prints || (res.manifest && (res.manifest.prints || res.manifest.sb_prints)) || 1);
      sbPackageExtras = {
        photocards: sbNormalizeExtraCount(res.photocards || (res.manifest && (res.manifest.photocards || res.manifest.photoCards || res.manifest.sb_photocards)) || 0),
        cds: sbNormalizeExtraCount(res.cds || (res.manifest && (res.manifest.cds || res.manifest.sb_cds)) || 0)
      };
      sbExtraUploads = { photocards: [], cds: [] };
      sbNormalizePtcardCards();
      sbSubmittedCards = Array.isArray(res.submittedCards) ? res.submittedCards : [];
      sbSubmittedLoading = Boolean(res.lazyFiles || res.loadingFiles);
      sbSubmittedLoadError = false;
      sbSubmittedGeneratedSmall = {};
      sbSubmittedActiveJobId = '';
      sbSubmittedActivePage = null;
      sbEnsureSubmittedActiveJob();
      var allowedPresets = sbAvailableFramePresets();
      if (allowedPresets.length && !allowedPresets.some(function (item) { return item.id === sbFramePresetId; })) {
        sbFramePresetId = allowedPresets[0].id;
      }
      sbPagePresetIds = [];
      sbNormalizePagePresetIds();
      sbImages = sbCollectViewerImages(res);
      sbImagesLoading = Boolean(res.lazyFiles || res.loadingFiles) && !sbImages.length;
      sbSetupEditWindow(res, true);
      sbSlots = [];
      sbTab = 'gallery';
      sbPage = 0;
      sbActive = 0;
      sbEditPanelOpen = false;
      sbPickerSlot = -1;
      sbClearCardPreviewObjectUrls();
      sbClearPtcardObjectUrls();
      sbUploadFileCache = {};
      sbSubmitJobId = '';
      sbSubmitJobSignature = '';
      sbCardPreviewCards = [];
      sbCardPreviewSignature = '';
      sbPtcardPreviewCards = [];
      sbPtcardPreviewSignature = '';
      for (var i = 0; i < sbTotalSlots(); i++) sbSlots.push(null);

      var header = document.querySelector('#ptb-app .ptb-hd');
      var title = document.querySelector('#ptb-app .ptb-hd h1');
      var desc = document.querySelector('#ptb-app .ptb-hd p');
      var cta = $('ptbCtaBtn');
      if (header) header.classList.add('is-selfbooth');
      if (title) title.textContent = 'SelfBooth Editor';
      if (desc) desc.textContent = 'Chọn ảnh gốc, tải ảnh đã chỉnh sửa lên slot, rồi gửi về thu ngân.';
      if (cta) cta.style.display = 'none';
      if (res.folderName) { var fl = $('ptbFolder'); fl.textContent = 'Folder ' + res.folderName; fl.style.display = 'inline-block'; }

      var html = '';
      html += '<div id="sbEditor" class="sb-shell">';
      html += '<div class="sb-top"><div class="sb-top-inner">';
      html += '<div class="sb-head-row">';
      html += '<div class="sb-brand">SELFBOOTH</div>';
      html += '<div id="sbFrameTitleTop" class="sb-title">Slot đang chọn <span id="sbActiveSlotTop">1</span>/' + sbTotalSlots() + ' slot · ' + sbTotalPages() + ' tấm</div>';
      html += '<button class="sb-help" title="Hướng dẫn SelfBooth" onclick="sbShowSelfBoothHelp()">?</button>';
      html += '</div>';
      html += '<div class="sb-tabs">';
      html += '<button id="sbTabBtnGallery" class="sb-tab is-active" onclick="sbSetTab(\'gallery\')">Tải ảnh</button>';
      html += '<button id="sbTabBtnFrame" class="sb-tab" onclick="sbSetTab(\'frame\')" title="Tải ảnh đã chỉnh lên slot, zoom/check, rồi gửi về thu ngân trong vòng 3 ngày.">Ghép frame</button>';
      html += '<button id="sbTabBtnSubmitted" class="sb-tab" onclick="sbSetTab(\'submitted\')">Ảnh đã ghép</button>';
      html += '</div><div id="sbCountdownCard" title="Bạn có 3 ngày để ghép frame và gửi về thu ngân. 6 giờ cuối sẽ hiện đếm ngược. Hết giờ, trang chỉ còn xem ảnh và tải ảnh gốc trong Drive." style="display:grid;gap:3px;border:1px solid #DED2BD;border-radius:16px;background:#FCFAF5;padding:10px 12px;color:#766E60;font-weight:900">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span style="font-size:.78rem">Thời gian chỉnh ảnh</span><strong id="sbCountdownValue" style="color:#536048;font-size:.98rem">3 ngày</strong></div>';
      html += '<div id="sbCountdownNote" style="font-size:.72rem;line-height:1.35;color:#766E60">Bạn có 3 ngày để tải ảnh lên slot, zoom/check frame và gửi về thu ngân. 6 giờ cuối sẽ hiện đếm ngược.</div>';
      html += '</div></div></div>';
      html += '<div class="sb-main">';
      html += '<section id="sbTabGallery" class="sb-tab-panel">';
      html += '<div class="sb-download-card">';
      html += '<div class="sb-download-title">Tải tất cả ảnh gốc</div>';
      html += '<div id="sbStorageNotice">' + sbStorageNoticeHtml() + '</div>';
      html += '<div class="sb-note">Mở folder Drive để tải trọn bộ ảnh JPG chất lượng gốc. Trong Drive, chọn tất cả ảnh rồi bấm Download/Tải xuống.</div>';
      html += '<button id="sbZipBtn" onclick="sbZip(this)" class="sb-download-primary">Tải tất cả trong Drive</button>';
      html += '<div id="sbZipStatus" class="sb-download-status"></div>';
      html += '</div>';
      html += '<div style="height:1px;background:#DED2BD;margin:16px 0"></div>';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:10px">';
      html += '<div><div class="sb-download-title" style="font-size:1.05rem">Ảnh đã chụp</div><div class="sb-note" style="margin:2px 0 0">Chạm ảnh để xem lớn, hoặc tải từng ảnh nếu cần.</div></div>';
      html += '<strong id="sbImageCount" style="color:#536048;font-size:.82rem">' + (sbImagesLoading ? 'Đang tải ảnh...' : (sbImages.length + ' ảnh')) + '</strong>';
      html += '</div>';
      html += '<div id="sbGalleryGrid" class="sb-gallery-grid">' + sbGalleryHtml() + '</div>';
      html += '</section>';
      html += '<section id="sbTabFrame" class="sb-tab-panel" style="display:none">';
      html += '<div class="sb-step-guide">';
      html += '<div class="sb-step-item"><div class="sb-step-num">1</div><div><strong>Bước 1: Chọn frame</strong><span>Chọn mẫu card bạn thích trong kho frame bên dưới.</span></div></div>';
      html += '</div>';
      html += '<div style="max-width:560px;margin:0 auto 8px;color:#766E60;font-size:.78rem;font-weight:900">Kho frame cho gói này</div>';
      html += '<div id="sbPresetButtons"></div>';
      html += '<div class="sb-step-guide">';
      html += '<div class="sb-step-item"><div class="sb-step-num">2</div><div><strong>Bước 2: Tải ảnh đã làm đẹp</strong><span>Dùng ảnh đã chỉnh bằng Xingtu, tải lên slot rồi canh zoom cho vừa card.</span></div></div>';
      html += '</div>';
      html += '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;max-width:560px;margin:0 auto 10px">';
      html += '<button id="sbPrevPageBtn" onclick="sbPrevPage()" class="sb-action" style="padding:9px 10px">Quay lại</button>';
      html += '<div style="text-align:center;font-size:.82rem;font-weight:900;color:#766E60">Tờ <span id="sbPageLabel">1/2</span></div>';
      html += '<button id="sbNextPageBtn" onclick="sbNextPage()" class="sb-action" style="padding:9px 10px">Tiếp theo</button>';
      html += '</div><div style="height:4px;background:#DED2BD;max-width:560px;margin:0 auto 12px"><div id="sbProgress" style="width:50%;height:100%;background:#536048"></div></div>';
      html += '<div id="sbFrameSlots" class="sb-small-card-edit-grid"></div><div id="sbFrameControls" class="sb-frame-control-layer" style="display:none"></div><div id="sbSlotPicker" class="sb-slot-picker" style="display:none"></div>';
      html += '<div id="sbExtraUploadWrap">' + sbExtraUploadHtml() + '</div>';
      html += '<div id="sbPtcardComposerWrap">' + sbPtcardComposerHtml() + '</div>';
      html += '<div id="sbCdComposerWrap">' + sbCdComposerHtml() + '</div>';
      html += '<div class="sb-step-guide">';
      html += '<div class="sb-step-item"><div class="sb-step-num">3</div><div><strong>Bước 3: Xem lại card đã ghép</strong><span>Các card nhỏ đã hiển thị sẵn bên trên. Khi gửi, hệ thống sẽ tạo ảnh A4 chất lượng cao để in.</span></div></div>';
      html += '</div>';
      html += '<div class="sb-card-preview">';
      html += '<div class="sb-card-preview-head"><strong>Trạng thái card</strong><button id="sbPreviewCardsBtn" onclick="sbPreviewCards()" class="sb-action primary" style="padding:9px 12px">Cập nhật xem lại</button></div>';
      html += '<div id="sbCardPreviewStatus" class="sb-card-preview-status">Chưa có ảnh xem lại.</div>';
      html += '<div id="sbFramePreviewGrid" class="sb-frame-preview-grid" style="display:none"></div>';
      html += '<div id="sbCardPreviewGrid" class="sb-card-preview-grid" style="display:none"></div>';
      html += '</div>';
      html += '<div class="sb-step-guide">';
      html += '<div class="sb-step-item"><div class="sb-step-num">4</div><div><strong>Bước 4: Gửi về thu ngân</strong><span>Sau khi xem lại card, bấm gửi về thu ngân để in.</span></div></div>';
      html += '</div>';
      html += '<div id="sbFloatingSubmit" class="sb-floating-submit"><button id="sbFloatingSubmitBtn" onclick="sbSubmit()">Gửi về thu ngân</button></div>';
      html += '<div class="sb-submit-card" style="max-width:560px;margin:14px auto 0">';
      html += '<h2 style="font-size:1.25rem;color:#4D493F;margin-bottom:8px">Kiểm tra và gửi về thu ngân</h2>';
      html += '<p class="sb-note" style="margin-bottom:14px">Kiểm tra các slot đã chọn. Có thể gửi thiếu slot chính, PT Card hoặc CD và bổ sung sau. Khi đang gửi, đừng tắt màn hình và hãy đợi đủ 100%.</p>';
      html += '<div id="sbSubmitSummary" style="font-size:.86rem;color:#766E60;font-weight:900;margin-bottom:14px">Chưa chọn ảnh nào.</div>';
      html += '<div id="sbSubmitProgressWrap" class="sb-submit-progress-wrap" style="display:none;margin-bottom:12px">';
      html += '<div class="sb-submit-progress-track"><div id="sbSubmitProgressBar" class="sb-submit-progress-fill" style="width:0%"></div></div>';
      html += '<div id="sbSubmitProgressText" style="margin-top:6px;color:#766E60;font-size:.78rem;font-weight:900">Đang chuẩn bị...</div>';
      html += '</div>';
      html += '<div class="sb-note">Bạn có thể đổi ảnh, chỉnh zoom rồi gửi lại nếu cần.</div>';
      html += '</div></section>';
      html += '<section id="sbTabSubmitted" class="sb-tab-panel" style="display:none">' + sbSubmittedCardsHtml() + '</section>';
      html += '<div class="sb-footer">';
      html += '<div class="sb-footer-title">DiciiBooth</div>';
      html += '<div class="sb-footer-body"><b>SelfBooth chụp tự do</b> với màu ảnh trong trẻo, tự nhiên.<br>📷 Chụp bằng <b>Fujifilm X-T3</b>.</div>';
      html += '<span class="sb-footer-copy">&copy; ' + new Date().getFullYear() + ' DiciiBooth since 2026.</span>';
      html += '</div>';
      html += ptbShareCardHtml('is-sb');
      html += '<div id="sbBottomEditor" class="sb-bottom-editor"><div id="sbEditPanel" style="display:none;border:1px solid #DED2BD;background:#FCFAF5;border-radius:12px;padding:10px;margin-bottom:10px;box-shadow:0 12px 32px rgba(92,55,40,.12)">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">';
      html += '<strong style="font-size:.78rem;color:#766E60">Chỉnh ảnh trong slot <span id="sbActiveSlotLabel">1</span></strong>';
      html += '<button onclick="sbCloseEditPanel()" style="width:28px;height:28px;border:1px solid #DED2BD;border-radius:999px;background:#FCFAF5;color:#766E60;font-weight:900">x</button>';
      html += '</div>';
      html += '<div style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:10px;align-items:center;margin-bottom:8px">';
      html += '<span style="font-size:.82rem;color:#536048;font-weight:900">Zoom</span>';
      html += '<input id="sbZoomRange" oninput="sbSetZoom(this.value)" type="range" min="100" max="250" value="100" style="width:100%;accent-color:#536048">';
      html += '<strong id="sbZoomValue" style="font-size:.78rem;color:#766E60;min-width:42px;text-align:center">100%</strong>';
      html += '<button class="sb-mini-tool-btn" onclick="sbFlipActive()"><span aria-hidden="true">&#8646;</span><span>LẬT</span></button>';
      html += '<button class="sb-mini-tool-btn danger" onclick="sbClearActive()"><span aria-hidden="true">&#10005;</span><span>XÓA</span></button>';
      html += '</div>';
      html += '<div class="sb-rotate-slider-grid">';
      html += '<span style="font-size:.82rem;color:#536048;font-weight:900">Xoay</span>';
      html += '<input id="sbRotateRange" oninput="sbSetRotate(this.value)" type="range" min="-180" max="180" step="1" value="0" style="width:100%;accent-color:#536048">';
      html += '<strong id="sbRotateValue" style="font-size:.78rem;color:#766E60;min-width:42px;text-align:center">0°</strong>';
      html += '</div>';
      html += '<div class="sb-rotate-detail-grid">';
      html += '<span style="font-size:.82rem;color:#536048;font-weight:900">Độ</span>';
      html += '<input class="sb-rotate-number" id="sbRotateInput" oninput="sbSetRotate(this.value)" type="number" min="-180" max="180" step="0.1" value="0">';
      html += '<button class="sb-mini-tool-btn" onclick="sbBumpRotate(-1)"><span aria-hidden="true">↶</span><span>-1°</span></button>';
      html += '<button class="sb-mini-tool-btn" onclick="sbBumpRotate(1)"><span aria-hidden="true">↷</span><span>+1°</span></button>';
      html += '</div>';
      html += '</div></div>';
      html += '<input id="sbUploadInput" type="file" accept="image/*" style="display:none">';
      html += '<input id="sbExtraUploadInput" type="file" accept="image/*" multiple style="display:none">';
      html += '<input id="sbPtcardUploadInput" type="file" accept="image/*" style="display:none">';
      html += '<input id="sbCdUploadInput" type="file" accept="image/*" style="display:none">';
      html += '</div></div>';
      $('ptbContent').innerHTML = html;
      sbNormalizeButtons($('ptbContent'));
      $('ptbContent').style.display = 'block';
      sbSetCardPreviewStatus('Chọn ảnh trực tiếp trên từng card nhỏ. Khi gửi, ảnh A4 sẽ được tạo một lần để in.', false, false);
      sbSetSubmitButtons(false, 'Gửi về thu ngân');
      sbRenderSlots();
      sbSyncTabs();
      sbStartEditCountdown();
      sbInitFancybox();
      if (!(res.lazyFiles || res.loadingFiles)) sbLoadPublicImagesFallback(res);
      var input = $('sbUploadInput');
      if (input) {
        input.onchange = function (event) {
          var file = event.target.files && event.target.files[0];
          if (!file) return;
          if (!sbRequireEditOpen()) {
            event.target.value = '';
            return;
          }
          var uploadKey = sbUploadCacheKey(file);
          var cachedUpload = sbUploadFileCache[uploadKey];
          var url = cachedUpload && cachedUpload.src ? cachedUpload.src : URL.createObjectURL(file);
          if (!cachedUpload) sbUploadFileCache[uploadKey] = { src: url, file: file, promise: null, name: file.name || '', type: file.type || 'application/octet-stream', size: file.size || 0 };
          else {
            cachedUpload.file = cachedUpload.file || file;
            cachedUpload.name = cachedUpload.name || file.name || '';
            cachedUpload.type = cachedUpload.type || file.type || 'application/octet-stream';
            cachedUpload.size = cachedUpload.size || file.size || 0;
          }
          var slotIndex = sbActive;
          sbSlots[slotIndex] = { src: url, uploadRef: uploadKey, name: file.name || ('slot_' + (slotIndex + 1) + '.jpg'), type: file.type || 'application/octet-stream', size: file.size || 0, source: 'upload', loading: false, zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, flipX: false, autoFit: true };
          sbActive = slotIndex;
          sbPage = sbPageForSlotIndex(sbActive);
          sbTab = 'frame';
          sbPickerSlot = -1;
          sbEditPanelOpen = true;
          sbInvalidateCardPreview({ keepPreview: true });
          sbPreserveSlotViewport(slotIndex, function () {
            sbRenderSlots();
          });
          event.target.value = '';
        };
      }
      var extraInput = $('sbExtraUploadInput');
      if (extraInput) {
        extraInput.onchange = function (event) {
          var files = Array.prototype.slice.call(event.target.files || []);
          if (!files.length || !sbExtraUploadTarget) return;
          if (!sbRequireEditOpen()) {
            event.target.value = '';
            return;
          }
          var kind = sbExtraUploadTarget;
          var limit = Math.max(0, Number(sbPackageExtras[kind] || 0));
          var current = sbExtraUploads[kind] || [];
          files.forEach(function (file) {
            if (current.length >= limit) return;
            var uploadKey = 'extra|' + kind + '|' + sbUploadCacheKey(file);
            var cachedUpload = sbUploadFileCache[uploadKey];
            var url = cachedUpload && cachedUpload.src ? cachedUpload.src : URL.createObjectURL(file);
            if (!cachedUpload) sbUploadFileCache[uploadKey] = { src: url, file: file, promise: null, name: file.name || '', type: file.type || 'application/octet-stream', size: file.size || 0 };
            current.push({ src: url, uploadRef: uploadKey, name: file.name || (kind + '_' + (current.length + 1) + '.jpg'), type: file.type || 'application/octet-stream', size: file.size || 0, source: 'upload', role: kind });
          });
          sbExtraUploads[kind] = current;
          sbExtraUploadTarget = '';
          event.target.value = '';
          sbRenderExtraUploads();
        };
      }
      var ptcardInput = $('sbPtcardUploadInput');
      if (ptcardInput) {
        ptcardInput.onchange = function (event) {
          var file = event.target.files && event.target.files[0];
          if (!file) return;
          if (!sbRequireEditOpen()) {
            event.target.value = '';
            return;
          }
          var cardIndex = sbClamp(Number(sbPtcardUploadTarget || 0), 0, Math.max(0, sbPtcardCards.length - 1));
          sbPtcardActiveSide = sbPtcardUploadSide;
          sbPtcardActiveSlot = sbPtcardUploadSlot;
          var uploadKey = 'ptcard|' + cardIndex + '|' + sbPtcardUploadSide + '|' + sbPtcardUploadSlot + '|' + sbUploadCacheKey(file);
          var cachedUpload = sbUploadFileCache[uploadKey];
          var url = cachedUpload && cachedUpload.src ? cachedUpload.src : URL.createObjectURL(file);
          if (!cachedUpload) sbUploadFileCache[uploadKey] = { src: url, file: file, promise: null, name: file.name || '', type: file.type || 'application/octet-stream', size: file.size || 0 };
          sbPtcardCards[cardIndex] = sbPtcardCards[cardIndex] || {};
          sbPtcardCards[cardIndex].slot = { src: url, uploadRef: uploadKey, name: file.name || ('ptcard_' + (cardIndex + 1) + '.jpg'), type: file.type || 'application/octet-stream', size: file.size || 0, source: 'upload', zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, flipX: false, autoFit: true };
          sbConstrainSlot(sbPtcardCards[cardIndex].slot, sbPtcardFrameSlot(sbPtcardPresetForCard(cardIndex)));
          sbPtcardActive = cardIndex;
          sbPtcardPreviewCards = [];
          sbPtcardPreviewSignature = '';
          sbRenderPtcardComposer();
          event.target.value = '';
        };
      }
      var cdInput = $('sbCdUploadInput');
      if (cdInput) {
        cdInput.onchange = function (event) {
          var file = event.target.files && event.target.files[0];
          if (!file) return;
          if (!sbRequireEditOpen()) {
            event.target.value = '';
            return;
          }
          var discIndex = sbClamp(Number(sbCdUploadTarget || 0), 0, Math.max(0, sbCdCards.length - 1));
          var uploadKey = 'cd|' + discIndex + '|' + sbUploadCacheKey(file);
          var cachedUpload = sbUploadFileCache[uploadKey];
          var url = cachedUpload && cachedUpload.src ? cachedUpload.src : URL.createObjectURL(file);
          if (!cachedUpload) sbUploadFileCache[uploadKey] = { src: url, file: file, promise: null, name: file.name || '', type: file.type || 'application/octet-stream', size: file.size || 0 };
          sbCdCards[discIndex] = sbCdCards[discIndex] || {};
          sbCdCards[discIndex].slot = { src: url, uploadRef: uploadKey, name: file.name || ('cd_' + (discIndex + 1) + '.jpg'), type: file.type || 'application/octet-stream', size: file.size || 0, source: 'upload', zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, flipX: false, autoFit: true };
          sbConstrainSlot(sbCdCards[discIndex].slot, sbPtcardFrameSlot(sbCdPresetForDisc(discIndex)));
          sbCdActive = discIndex;
          sbCdPreviewCards = [];
          sbCdPreviewSignature = '';
          sbRenderCdComposer();
          event.target.value = '';
        };
      }
    }

    function sbGalleryHtml() {
      if (!sbImages.length) {
        if (sbImagesLoading) {
          return '<div style="padding:18px;color:#536048;font-weight:900;display:flex;align-items:center;gap:8px"><span class="sb-loading-dots">Đang tải danh sách ảnh</span></div>';
        }
        return '<div style="padding:18px;color:#766E60;font-weight:800">Chưa có ảnh đã chụp trong folder.</div>';
      }
      var h = '';
      sbImages.forEach(function (f, idx) {
        var thumb = f.previewUrl || f.thumbnailUrl || f.originalImageUrl;
        var full = f.originalImageUrl || f.previewUrl || f.viewUrl || thumb;
        var num = idx + 1;
        h += '<div class="sb-photo-card">';
        h += '<a href="' + escAttr(full) + '" data-fancybox="sb-gallery" data-caption="' + escAttr(f.name) + '" style="border:none;background:transparent;padding:0;width:100%;display:block;text-align:left;line-height:0">';
        h += '<img src="' + escAttr(thumb) + '" alt="' + escAttr(f.name) + '" loading="lazy" class="no-fancybox">';
        h += '</a>';
        h += '<div class="sb-photo-badge">' + num + '</div>';
        h += '<button class="sb-photo-dl" title="Tải ảnh gốc" onclick="event.stopPropagation();ptbDl(\'' + f.downloadUrl + '\',\'' + escAttr(f.name) + '\',this)">&#8595;</button>';
        h += '</div>';
      });
      return h;
    }

    function sbExtraLabel(kind) {
      return kind === 'cds' ? 'CD' : 'Photocard bo góc';
    }

    function sbExtraUploadHtml() {
      var total = Number(sbPackageExtras.cds || 0);
      if (!total || sbAvailablePtcardPresets('cd').length) return '';
      var h = '<div class="sb-extra-upload">';
      h += '<div class="sb-extra-upload-head"><div><strong style="color:#4D493F;font-size:.86rem">File in thêm của gói</strong><div class="sb-note" style="margin:2px 0 0">Tải file mặt CD nếu gói có kèm. Photocard bo góc dùng mục PT Card bên dưới.</div></div></div>';
      h += '<div class="sb-extra-upload-row">';
      if (sbPackageExtras.cds > 0) h += '<button class="sb-extra-upload-btn" onclick="sbUploadExtra(\'cds\')">Tải mặt CD<br><span style="font-size:.68rem;color:#766E60">' + sbExtraUploads.cds.length + '/' + sbPackageExtras.cds + ' file</span></button>';
      h += '</div>';
      ['cds'].forEach(function (kind) {
        if (!sbPackageExtras[kind]) return;
        var items = sbExtraUploads[kind] || [];
        h += '<div style="margin-top:10px"><strong style="color:#536048;font-size:.76rem">' + sbExtraLabel(kind) + '</strong>';
        if (!items.length) h += '<div class="sb-note" style="margin:4px 0 0">Chưa tải file.</div>';
        else {
          h += '<div class="sb-extra-upload-list">';
          items.forEach(function (item, index) {
            h += '<a class="sb-extra-thumb" href="' + escAttr(item.src) + '" data-fancybox="sb-extra-' + kind + '" data-caption="' + escAttr(item.name || sbExtraLabel(kind)) + '"><img src="' + escAttr(item.src) + '" alt=""><span>' + (index + 1) + '. ' + esc(item.name || sbExtraLabel(kind)) + '</span></a>';
          });
          h += '</div>';
        }
        h += '</div>';
      });
      h += '</div>';
      return h;
    }

    function sbRenderExtraUploads() {
      var wrap = $('sbExtraUploadWrap');
      if (!wrap) return;
      wrap.innerHTML = sbExtraUploadHtml();
      sbNormalizeButtons(wrap);
      sbInitFancybox();
      sbSyncControls();
    }

    function sbSubmittedCardUrl(item) {
      return (item && (item.originalImageUrl || item.previewUrl || item.url || item.downloadUrl)) || '';
    }

    function sbSubmittedCardThumb(item) {
      return (item && (item.previewUrl || item.originalImageUrl || item.url || item.downloadUrl)) || '';
    }

    function sbSubmittedDownloadUrl(item) {
      return (item && (item.downloadUrl || item.originalImageUrl || item.url || item.previewUrl)) || '';
    }

    window.sbRememberSubmittedImageRatio = function (img) {
      if (!img) return;
      var w = Number(img.naturalWidth || img.width || 0);
      var h = Number(img.naturalHeight || img.height || 0);
      if (w > 0 && h > 0) img.style.setProperty('--sb-submitted-ratio', w + ' / ' + h);
    };

    function sbSubmittedRatioStyle(item) {
      var w = Number(item && (item.w || item.width || item.imageWidth || 0));
      var h = Number(item && (item.h || item.height || item.imageHeight || 0));
      if (!(w > 0 && h > 0)) return '';
      return ' style="--sb-submitted-ratio:' + w + ' / ' + h + '"';
    }

    function sbSubmittedCardRegionsForPage(card) {
      var page = Number(card && card.page || 0);
      var saved = card && Array.isArray(card.cardRegions) ? card.cardRegions : [];
      for (var i = 0; i < saved.length; i++) {
        var item = saved[i] || {};
        if (Number(item.page || 0) === page && Array.isArray(item.regions)) {
          var regions = item.regions.map(function (region) {
            return {
              x: Math.max(0, Number(region.x || 0)),
              y: Math.max(0, Number(region.y || 0)),
              w: Math.max(1, Number(region.w || region.width || 1)),
              h: Math.max(1, Number(region.h || region.height || 1)),
              rotate: Number(region.rotate || 0),
              label: String(region.label || region.name || '').trim()
            };
          });
          return regions.every(function (region) { return region.w > 1 && region.h > 1; }) ? regions : [];
        }
      }
      // Older jobs without stored regions cannot be cropped reliably: the
      // preset may have changed since the customer submitted the frame.
      return [];
    }

    function sbSubmittedJobGroups() {
      var grouped = {};
      (sbSubmittedCards || []).forEach(function (item) {
        if (!item) return;
        var jobId = String(item.jobId || item.job_id || item.createdAt || item.id || 'submitted').trim() || 'submitted';
        if (!grouped[jobId]) grouped[jobId] = { id: jobId, createdAt: item.createdAt || '', cards: [], previews: [], ptcards: [], cds: [] };
        if (item.createdAt && (!grouped[jobId].createdAt || String(item.createdAt) > String(grouped[jobId].createdAt))) grouped[jobId].createdAt = item.createdAt;
        if (item.type === 'preview') grouped[jobId].previews.push(item);
        else if (item.type === 'ptcard') grouped[jobId].ptcards.push(item);
        else if (item.type === 'cd') grouped[jobId].cds.push(item);
        else grouped[jobId].cards.push(item);
      });
      return Object.keys(grouped).map(function (key) { return grouped[key]; }).sort(function (a, b) {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
    }

    function sbSubmittedJobFileCount(job) {
      if (!job) return 0;
      return (job.cards || []).length + (job.previews || []).length + (job.ptcards || []).length + (job.cds || []).length;
    }

    function sbSubmittedJobLabel(job, index) {
      var label = 'Bộ ' + (index + 1);
      if (job && job.createdAt) {
        var d = new Date(job.createdAt);
        if (!isNaN(d.getTime())) label += ' · ' + d.toLocaleString('vi-VN', { hour12: false });
      }
      return label;
    }

    function sbEnsureSubmittedActiveJob(groups) {
      groups = groups || sbSubmittedJobGroups();
      if (!groups.length) {
        sbSubmittedActiveJobId = '';
        return null;
      }
      var active = groups.filter(function (job) { return job.id === sbSubmittedActiveJobId; })[0];
      if (!active) {
        active = groups[0];
        sbSubmittedActiveJobId = active.id;
      }
      return active;
    }

    function sbSubmittedThumbHtml(item, index, groupName, isBig) {
      var title = item && item.type === 'cd'
        ? ('CD ' + (Number(item.disc || item.card || 0) + 1) + ' mặt đĩa')
        : item && item.type === 'ptcard'
          ? ('PT Card ' + (Number(item.card || 0) + 1) + (item.side === 'back' ? ' mặt 2' : ' mặt 1'))
          : (item && item.label ? String(item.label) : ((isBig ? 'Card to ' : 'Card nhỏ ') + (index + 1)));
      var name = item.name || title;
      var fullUrl = sbSubmittedCardUrl(item);
      var thumbUrl = sbSubmittedCardThumb(item);
      var downloadUrl = sbSubmittedDownloadUrl(item);
      var cls = 'sb-submitted-thumb ' + (isBig ? 'is-big' : 'is-small');
      var h = '<div class="' + cls + '">';
      if (isBig) {
        h += '<button type="button" onclick="sbOpenSubmittedCard(' + Number(item.page || 0) + ')" aria-label="Xem card nhỏ trong ' + escAttr(name) + '" oncontextmenu="return false" ondragstart="return false" style="border:0;background:transparent;padding:0;width:100%;cursor:pointer;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none"><img draggable="false" src="' + escAttr(thumbUrl) + '" alt="" loading="lazy" onload="sbRememberSubmittedImageRatio(this)"' + sbSubmittedRatioStyle(item) + '></button>';
        h += '<span>' + esc(name) + '</span></div>';
        return h;
      }
      h += '<a href="' + escAttr(fullUrl) + '" data-fancybox="' + escAttr(groupName) + '" data-caption="' + escAttr(name) + '"><img src="' + escAttr(thumbUrl) + '" alt="" loading="lazy" onload="sbRememberSubmittedImageRatio(this)"' + sbSubmittedRatioStyle(item) + '></a>';
      h += '<span>' + esc(item && item.type === 'preview' ? title : name) + '</span>';
      h += '<div class="sb-submitted-actions">';
      h += '<a class="sb-submitted-download" href="' + escAttr(fullUrl) + '" target="_blank" rel="noopener">Mở</a>';
      h += '<a class="sb-submitted-download" href="' + escAttr(downloadUrl) + '" download="' + escAttr(name) + '" target="_blank" rel="noopener">Tải</a>';
      h += '</div></div>';
      return h;
    }

    function sbSubmittedSmallKey(jobId, page) {
      return String(jobId || '') + '|' + Number(page || 0);
    }

    function sbSubmittedSmallGridHtml(items, groupName) {
      var columns = [[], []];
      var heights = [0, 0];
      items.forEach(function (item, index) {
        var column = heights[0] <= heights[1] ? 0 : 1;
        var w = Number(item.w || item.width || 0), h = Number(item.h || item.height || 0);
        var ratio = w > 0 && h > 0 ? h / w : 1;
        heights[column] += Math.min(2.5, ratio) + 0.5;
        columns[column].push(sbSubmittedThumbHtml(item, index, groupName, false));
      });
      return '<div class="sb-submitted-small-grid">' + columns.map(function (itemsInColumn) {
        return '<div class="sb-submitted-small-column">' + itemsInColumn.join('') + '</div>';
      }).join('') + '</div>';
    }

    function sbSubmittedCropKey(region) {
      return [Math.round(region.x || 0), Math.round(region.y || 0), Math.round(region.w || 0), Math.round(region.h || 0), Number(region.rotate || 0).toFixed(2)].join('_');
    }

    function sbSubmittedGeneratedSmallForJob(job, page) {
      if (!job || !job.id) return [];
      var cached = sbSubmittedGeneratedSmall[sbSubmittedSmallKey(job.id, page)];
      if (Array.isArray(cached)) return cached;
      var card = job.cards.filter(function (item) { return Number(item.page || 0) === Number(page); })[0];
      if (!card) return [];
      var regions = card ? sbSubmittedCardRegionsForPage(card) : [];
      var saved = job.previews.filter(function (item) { return Number(item.page || 0) === Number(page) && item.renderVersion === 'crop_png_v1' && item.sourceFileId === card.id; }).sort(function (a, b) { return Number(a.region || 0) - Number(b.region || 0); });
      if (regions.length && regions.every(function (region, index) { return saved.some(function (item) { return Number(item.region || 0) === index && item.id && item.cropKey === sbSubmittedCropKey(region); }); })) return saved.filter(function (item) { return regions[Number(item.region || 0)] && item.cropKey === sbSubmittedCropKey(regions[Number(item.region || 0)]); });
      return [];
    }

    function sbSubmittedCardsHtml() {
      var cards = sbSubmittedCards || [];
      var groups = sbSubmittedJobGroups();
      var activeJob = sbEnsureSubmittedActiveJob(groups);
      var activeIndex = groups.indexOf(activeJob);
      var big = activeJob ? activeJob.cards : [];
      var h = '<div class="sb-submitted-card">';
      h += '<div class="sb-submitted-head"><div><strong style="color:#4D493F;font-size:.9rem">Ảnh đã ghép và đã gửi</strong><div class="sb-note" style="margin:2px 0 0">Các card nhỏ được tạo tự động để xem và tải.</div></div><strong style="color:#536048;font-size:.78rem">' + (sbSubmittedLoading && !cards.length ? 'Đang tải...' : groups.length + ' bộ · ' + cards.length + ' file') + '</strong></div>';
      if (!cards.length) {
        if (sbSubmittedLoading) {
          h += '<div class="sb-small-card-empty" role="status" aria-live="polite"><span class="sb-loading-dots">Đang tải ảnh đã ghép</span></div>';
        } else if (sbSubmittedLoadError) {
          h += '<div class="sb-small-card-empty">Không tải được ảnh đã ghép. Vui lòng tải lại trang để thử lại.</div>';
        } else {
          h += '<div class="sb-small-card-empty">Chưa có ảnh đã ghép. Sau khi gửi về thu ngân, ảnh card sẽ hiện ở đây.</div>';
        }
      } else {
        h += '<div class="sb-submitted-job-list">';
        groups.forEach(function (job, index) {
          h += '<button class="sb-submitted-job' + (job.id === sbSubmittedActiveJobId ? ' is-active' : '') + '" onclick="sbSetSubmittedJob(\'' + escAttr(job.id) + '\')">' + esc(sbSubmittedJobLabel(job, index)) + ' · ' + sbSubmittedJobFileCount(job) + ' file</button>';
        });
        h += '</div>';
        h += '<div style="margin-top:10px"><strong style="color:#536048;font-size:.78rem">Card to</strong><div class="sb-submitted-list">';
        big.forEach(function (item, index) {
          h += sbSubmittedThumbHtml(item, index, 'sb-submitted-big-' + activeIndex, true);
        });
        if (!big.length) h += '<div class="sb-small-card-empty">Bộ này chưa có card to.</div>';
        h += '</div></div>';
        big.forEach(function (card) {
          var page = Number(card.page || 0);
          var small = sbSubmittedGeneratedSmallForJob(activeJob, page);
          var generatedState = sbSubmittedGeneratedSmall[sbSubmittedSmallKey(activeJob.id, page)];
          h += '<div id="sb-submitted-small-page-' + page + '" style="margin-top:12px"><strong style="color:#536048;font-size:.78rem">Card nhỏ · frame ' + (page + 1) + '</strong>';
          if (generatedState === 'loading' || !generatedState && !small.length) {
            h += '<div class="sb-note" style="margin:6px 0 0">Đang tạo card nhỏ từ card to <span class="sb-loading-dots"></span></div>';
          } else if (!small.length) {
            h += '<div class="sb-note" style="margin:6px 0 0">' + (generatedState === 'error' ? 'Chưa tạo được card nhỏ. Vui lòng thử lại hoặc liên hệ thu ngân.' : 'Frame này chưa có vùng card nhỏ để tải.') + '</div>';
            if (generatedState === 'error') h += '<button class="sb-action primary" style="margin-top:8px;padding:9px 12px" onclick="sbGenerateSubmittedSmallCards(\'' + escAttr(activeJob.id) + '\',' + page + ')">Thử lại</button>';
          } else {
            h += sbSubmittedSmallGridHtml(small, 'sb-submitted-small-' + activeIndex + '-' + page);
            if (small.syncError) h += '<div class="sb-note" style="margin:6px 0 0">Card nhỏ đã tạo trên thiết bị; chưa lưu được lên Drive. Bạn vẫn có thể tải ảnh PNG.</div>';
          }
          h += '</div>';
        });
        if (activeJob.ptcards && activeJob.ptcards.length) {
          h += '<div style="margin-top:12px"><strong style="color:#536048;font-size:.78rem">PT Card</strong><div class="sb-submitted-ptcard-grid">';
          activeJob.ptcards.forEach(function (item, index) {
            h += sbSubmittedThumbHtml(item, index, 'sb-submitted-ptcard-' + activeIndex, false);
          });
          h += '</div></div>';
        }
        if (activeJob.cds && activeJob.cds.length) {
          h += '<div style="margin-top:12px"><strong style="color:#536048;font-size:.78rem">CD/DVD</strong><div class="sb-submitted-ptcard-grid is-cd">';
          activeJob.cds.forEach(function (item, index) {
            h += sbSubmittedThumbHtml(item, index, 'sb-submitted-cd-' + activeIndex, false);
          });
          h += '</div></div>';
        }
      }
      h += '</div>';
      return h;
    }

    function sbRenderSubmittedCards() {
      var panel = $('sbTabSubmitted');
      if (!panel) return;
      panel.innerHTML = sbSubmittedCardsHtml();
      sbNormalizeButtons(panel);
      sbInitFancybox();
      var activeJob = sbEnsureSubmittedActiveJob();
      if (activeJob && sbTab === 'submitted') {
        activeJob.cards.forEach(function (card) {
          var page = Number(card.page || 0);
          var key = sbSubmittedSmallKey(activeJob.id, page);
          if (!sbSubmittedGeneratedSmallForJob(activeJob, page).length && !sbSubmittedGeneratedSmall[key]) {
            window.setTimeout(function () { sbGenerateSubmittedSmallCards(activeJob.id, page); }, 30);
          }
        });
      }
    }

    window.sbSetSubmittedJob = function (jobId) {
      sbSubmittedActiveJobId = String(jobId || '');
      sbSubmittedActivePage = null;
      sbRenderSubmittedCards();
    };

    window.sbOpenSubmittedCard = function (page) {
      sbSubmittedActivePage = Math.max(0, Number(page || 0));
      sbRenderSubmittedCards();
      var section = $('sb-submitted-small-page-' + sbSubmittedActivePage);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.sbGenerateSubmittedSmallCards = function (jobId, page) {
      var groups = sbSubmittedJobGroups();
      var job = groups.filter(function (item) { return item.id === jobId; })[0];
      var card = job && job.cards.filter(function (item) { return Number(item.page || 0) === Number(page); })[0];
      var key = sbSubmittedSmallKey(jobId, page);
      if (!card || sbSubmittedGeneratedSmall[key] === 'loading') return;
      var regions = sbSubmittedCardRegionsForPage(card);
      if (!regions.length) { sbSubmittedGeneratedSmall[key] = []; sbRenderSubmittedCards(); return; }
      sbSubmittedGeneratedSmall[key] = 'loading';
      sbRenderSubmittedCards();
      loadImageForCanvas(sbSubmittedCardUrl(card)).then(function (img) {
        var imageWidth = Number(img.naturalWidth || img.width || 0);
        var imageHeight = Number(img.naturalHeight || img.height || 0);
        if (!(imageWidth > 0 && imageHeight > 0) || regions.some(function (region) {
          var x = Math.round(region.x), y = Math.round(region.y), w = Math.round(region.w), h = Math.round(region.h);
          var radians = Number(region.rotate || 0) * Math.PI / 180;
          var halfW = (Math.abs(Math.cos(radians)) * w + Math.abs(Math.sin(radians)) * h) / 2;
          var halfH = (Math.abs(Math.sin(radians)) * w + Math.abs(Math.cos(radians)) * h) / 2;
          var cx = x + w / 2, cy = y + h / 2;
          return w <= 1 || h <= 1 || cx - halfW < -0.5 || cy - halfH < -0.5 || cx + halfW > imageWidth + 0.5 || cy + halfH > imageHeight + 0.5 || (x === 0 && y === 0 && w === imageWidth && h === imageHeight && !Number(region.rotate || 0));
        })) throw new Error('Vùng card nhỏ không hợp lệ.');
        var output = regions.map(function (region, regionIndex) {
          var label = sbCardRegionLabel(region, regionIndex);
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(region.w));
          canvas.height = Math.max(1, Math.round(region.h));
          var ctx = canvas.getContext('2d');
          sbSetCanvasQuality(ctx);
          var x = Math.round(region.x), y = Math.round(region.y), rotation = Number(region.rotate || 0);
          if (rotation) {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-rotation * Math.PI / 180);
            ctx.drawImage(img, -(x + canvas.width / 2), -(y + canvas.height / 2));
          } else {
            ctx.drawImage(img, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
          }
          var dataUrl = canvas.toDataURL('image/png');
          var bytes = atob(dataUrl.split(',')[1]);
          var buffer = new Uint8Array(bytes.length);
          for (var i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
          var localUrl = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));
          return { type: 'preview', label: label, name: 'card_nho_' + (Number(page) + 1) + '_' + (regionIndex + 1) + '.png', page: Number(page), region: regionIndex, w: canvas.width, h: canvas.height, originalImageUrl: localUrl, previewUrl: localUrl, downloadUrl: localUrl, uploadDataUrl: dataUrl, cropKey: sbSubmittedCropKey(region) };
        });
        sbSubmittedGeneratedSmall[key] = output;
        sbRenderSubmittedCards();
        return output.reduce(function (chain, localItem, regionIndex) {
          return chain.then(function () {
            return postSbPayload({ action: 'saveSelfBoothPreviewCard', folderId: sbSessionFolderId || fid, jobId: jobId, sourceFileId: card.id, cropKey: localItem.cropKey, page: Number(page), region: regionIndex, label: localItem.label, w: localItem.w, h: localItem.h, dataUrl: localItem.uploadDataUrl }).then(function (result) {
              var file = result && result.file;
              if (!file || !file.id) throw new Error('Chưa lưu được card nhỏ.');
              var item = sbSubmittedFileFromResponse(file, 'preview', card.createdAt || '', {});
              item.jobId = jobId;
              item.renderVersion = 'crop_png_v1';
              item.sourceFileId = card.id;
              item.cropKey = localItem.cropKey;
              URL.revokeObjectURL(localItem.originalImageUrl);
              output[regionIndex] = item;
              sbRenderSubmittedCards();
            });
          });
        }, Promise.resolve()).catch(function (err) {
          output.syncError = true;
          output.forEach(function (item) { delete item.uploadDataUrl; });
          console.warn('Không lưu được card nhỏ lên Drive:', err);
          sbRenderSubmittedCards();
        });
      }).catch(function (err) {
        console.warn('Không tạo được card nhỏ:', err);
        sbSubmittedGeneratedSmall[key] = 'error';
        sbRenderSubmittedCards();
      });
    };

    function sbSubmittedFileFromResponse(file, type, createdAt, context) {
      file = file || {};
      context = context || {};
      var fileId = String(file.id || file.fileId || '').trim();
      if (!fileId) return null;
      return {
        type: type || 'card',
        jobId: sbSubmitJobId || '',
        createdAt: createdAt || new Date().toISOString(),
        page: Number(file.page || 0),
        region: Number(file.region || 0),
        card: Number(file.card || 0),
        disc: Number(file.disc || file.card || 0),
        side: String(file.side || ''),
        preset: String(file.preset || ''),
        id: fileId,
        name: file.name || '',
        label: String(file.label || ''),
        size: file.size || 0,
        w: Number(file.w || file.width || 0),
        h: Number(file.h || file.height || 0),
        renderVersion: String(file.renderVersion || ''),
        sourceFileId: String(file.sourceFileId || ''),
        cropKey: String(file.cropKey || ''),
        cardRegions: file.cardRegions || context.cardRegions || sbSubmittedCardRegionsPayload(context.submittedPages),
        framePreset: file.framePreset || context.framePreset || sbFramePresetId,
        framePresets: file.framePresets || context.framePresets || sbPagePresetIds.slice(0, sbTotalPages()),
        ptcardFrames: file.ptcardFrames || context.ptcardFrames || [],
        ptcardSlots: file.ptcardSlots || context.ptcardSlots || [],
        cdFrames: file.cdFrames || context.cdFrames || [],
        cdSlots: file.cdSlots || context.cdSlots || [],
        url: file.url || ('https://drive.google.com/file/d/' + fileId + '/view'),
        viewUrl: 'https://drive.google.com/file/d/' + fileId + '/preview',
        previewUrl: 'https://lh3.googleusercontent.com/d/' + fileId + '=w1600',
        originalImageUrl: 'https://lh3.googleusercontent.com/d/' + fileId + '=s0',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId
      };
    }

    function sbMergeSubmittedCardsFromSubmit(result, createdAt) {
      var next = [];
      var context = {
        submittedPages: result.submittedPages || [],
        framePreset: result.framePreset || '',
        framePresets: result.framePresets || [],
        ptcardFrames: result.ptcardFrames || [],
        ptcardSlots: result.ptcardSlots || [],
        cdFrames: result.cdFrames || [],
        cdSlots: result.cdSlots || [],
        cardRegions: result.cardRegions || []
      };
      (result.cardFiles || []).forEach(function (file) {
        var item = sbSubmittedFileFromResponse(file, 'card', createdAt, context);
        if (item) next.push(item);
      });
      (result.previewCardFiles || []).forEach(function (file) {
        var item = sbSubmittedFileFromResponse(file, 'preview', createdAt, context);
        if (item) next.push(item);
      });
      (result.ptcardFiles || []).forEach(function (file) {
        var itemType = String(file && (file.kind || file.type) || '').toLowerCase() === 'cd' ? 'cd' : 'ptcard';
        var item = sbSubmittedFileFromResponse(file, itemType, createdAt, context);
        if (item) next.push(item);
      });
      if (!next.length) return;
      var seen = {};
      sbSubmittedCards = next.concat(sbSubmittedCards || []).filter(function (item) {
        var key = item.type + '|' + item.id;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      if (next[0] && next[0].jobId) sbSubmittedActiveJobId = next[0].jobId;
      sbSubmittedGeneratedSmall = {};
      sbRenderSubmittedCards();
    }

    function sbInitFancybox() {
      setTimeout(function () {
        ptbEnsureFancybox(function () {
          jQuery('[data-fancybox^="sb-"]:not([data-fancybox^="sb-submitted-"]):not([data-fancybox="sb-frame-preview"])').fancybox({
            buttons: ['zoom', 'download', 'slideShow', 'close'],
            loop: true,
            protect: false,
            animationEffect: 'zoom-in-out',
            transitionEffect: 'slide',
            idleTime: 4
          });
          jQuery('[data-fancybox^="sb-submitted-"], [data-fancybox="sb-frame-preview"]').fancybox({
            buttons: ['zoom', 'slideShow', 'close'],
            loop: true,
            protect: false,
            animationEffect: 'zoom-in-out',
            transitionEffect: 'slide',
            idleTime: 4
          });
        });
      }, 100);
    }

    function sbRefreshGalleryHtml() {
      var grid = $('sbGalleryGrid');
      var count = $('sbImageCount');
      if (grid) {
        grid.innerHTML = sbGalleryHtml();
        sbNormalizeButtons(grid);
      }
      if (count) count.textContent = sbImagesLoading ? 'Đang tải ảnh...' : (sbImages.length + ' ảnh');
      sbInitFancybox();
      sbRefreshStorageNotice();
      sbRenderFrameQuickPick();
    }

    function applySbFilesData(res) {
      var manifest = (res && res.manifest) || {};
      sbSessionFolderId = res.session_folder_id || res.sessionFolderId || res.root_folder_id || res.rootFolderId || sbSessionFolderId || fid;
      sbDownloadFolderId = res.public_folder_id || res.publicFolderId || res.photos_folder_id || res.photosFolderId || manifest.public_folder_id || manifest.publicFolderId || manifest.photos_folder_id || manifest.photosFolderId || sbDownloadFolderId || fid;
      sbDownloadDriveUrl = 'https://drive.google.com/drive/folders/' + encodeURIComponent(sbDownloadFolderId);
      sbKeyCode = res.code || res.key || manifest.code || manifest.key || sbKeyCode || '';
      sbCustomerName = res.customer_name || res.customerName || manifest.customer_name || manifest.customerName || sbCustomerName || '';
      sbCustomerPhone = res.customer_phone || res.customerPhone || manifest.customer_phone || manifest.customerPhone || sbCustomerPhone || '';
      sbApplyFramePresetsFromPayload(res);
      sbApplyPtcardPresetsFromPayload(res);
      sbViewerPackage = sbNormalizePackage(res.package || (manifest && (manifest.package || manifest.sb_package)) || sbViewerPackage || '');
      sbPrintCount = sbNormalizePrintCount(res.prints || (manifest && (manifest.prints || manifest.sb_prints)) || sbPrintCount || 1);
      sbPackageExtras = {
        photocards: sbNormalizeExtraCount(res.photocards || (manifest && (manifest.photocards || manifest.photoCards || manifest.sb_photocards)) || sbPackageExtras.photocards || 0),
        cds: sbNormalizeExtraCount(res.cds || (manifest && (manifest.cds || manifest.sb_cds)) || sbPackageExtras.cds || 0)
      };
      sbSubmittedCards = Array.isArray(res.submittedCards) ? res.submittedCards : sbSubmittedCards;
      sbSubmittedLoading = false;
      sbSubmittedLoadError = false;
      sbEnsureSubmittedActiveJob();
      sbImages = sbCollectViewerImages(res);
      sbImagesLoading = false;
      sbSetupEditWindow(res, !sbEditWindowFromData);
      sbRefreshGalleryHtml();
      sbNormalizePtcardCards();
      sbRenderPtcardComposer();
      sbNormalizeCdCards();
      sbRenderCdComposer();
      sbUpdateEditCountdown();
      sbRefreshStorageNotice();
      sbRenderExtraUploads();
      var submittedPanel = $('sbTabSubmitted');
      if (submittedPanel) {
        sbRenderSubmittedCards();
      }
    }

    function sbLoadFolderData(folderId, onDone) {
      var sbUrl = API + '?action=getFiles&mode=sb&id=' + encodeURIComponent(folderId);
      fetch(sbUrl, { redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) { onDone(JSON.parse(t)); })
        .catch(function () {
          var cb = 'sbFallbackCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          window[cb] = function (d) {
            delete window[cb];
            onDone(d || {});
          };
          var s = document.createElement('script');
          s.src = sbUrl + '&callback=' + cb;
          s.onerror = function () { delete window[cb]; };
          document.body.appendChild(s);
        });
    }

    function sbLoadPublicImagesFallback(res) {
      if (sbImages.length) return;
      var manifest = (res && res.manifest) || {};
      var folderId = res.public_folder_id || res.publicFolderId || res.photos_folder_id || res.photosFolderId || manifest.public_folder_id || manifest.publicFolderId || manifest.photos_folder_id || manifest.photosFolderId || '';
      if (!folderId || folderId === fid) return;
      sbLoadFolderData(folderId, function (data) {
        var fallbackImages = sbCollectViewerImages(data);
        if (!fallbackImages.length) return;
        sbImages = fallbackImages;
        sbSetupEditWindow(data, !sbEditWindowFromData);
        sbDownloadFolderId = folderId;
        sbDownloadDriveUrl = 'https://drive.google.com/drive/folders/' + encodeURIComponent(folderId);
        sbRefreshGalleryHtml();
        sbRenderPtcardComposer();
        sbRenderCdComposer();
        sbUpdateEditCountdown();
        sbRefreshStorageNotice();
      });
    }

    function sbFrameQuickPickHtml() {
      var h = '';
      h += '<div class="sb-frame-quick-head">';
      h += '<div><strong style="color:#4D493F;font-size:.86rem">Chọn ảnh cho slot ' + (sbActive + 1) + '</strong><div class="sb-note" style="margin:2px 0 0">Vuốt ngang để chọn ảnh đã chụp. Slot trống trên card có dấu + để tải ảnh lên.</div></div>';
      h += '</div>';
      if (!sbImages.length) {
        if (sbImagesLoading) {
          h += '<div style="padding:10px 0;color:#536048;font-weight:900"><span class="sb-loading-dots">Đang tải ảnh Drive</span></div>';
          return h;
        }
        h += '<div style="padding:10px 0;color:#766E60;font-weight:800">Chưa có ảnh sẵn trong Drive.</div>';
        return h;
      }
      h += '<div class="sb-frame-photo-row">';
      sbImages.forEach(function (f, idx) {
        var thumb = f.previewUrl || f.thumbnailUrl || f.originalImageUrl || '';
        h += '<button class="sb-frame-photo-pick" onclick="sbPickDriveToSlot(' + idx + ',sbActive)">';
        h += '<img src="' + thumb + '" alt="">';
        h += '<span style="position:absolute;left:6px;top:6px;background:rgba(255,255,255,.92);border-radius:999px;padding:2px 7px;font-size:.66rem;color:#4D493F;font-weight:900">' + (idx + 1) + '</span>';
        h += '</button>';
      });
      h += '</div>';
      return h;
    }

    function sbRenderFrameQuickPick() {
      var quick = $('sbFrameQuickPick');
      if (!quick) return;
      quick.innerHTML = sbFrameQuickPickHtml();
      sbNormalizeButtons(quick);
    }

    function sbRenderSlotControls(start, slotsPerPage, pageSlots, cardW, cardH, preset) {
      var layer = $('sbFrameControls');
      if (!layer) return;
      var h = '';
      for (var j = 0; j < slotsPerPage; j++) {
        var idx = start + j;
        var slot = sbSlots[idx];
        var active = idx === sbActive;
        var frameSlot = pageSlots[j] || sbDefaultPageSlots(cardW)[j % SB_DEFAULT_SLOTS_PER_PAGE];
        var x = Number(frameSlot.x || 0);
        var y = Number(frameSlot.y || 0);
        var slotW = Number(frameSlot.w || frameSlot.width || 1);
        var slotH = Number(frameSlot.h || frameSlot.height || 1);
        var rotate = Number(frameSlot.rotate || 0);
        var left = (x / cardW) * 100;
        var top = (y / cardH) * 100;
        var width = (slotW / cardW) * 100;
        var height = (slotH / cardH) * 100;
        var hasImage = Boolean(slot && slot.src);
        h += '<div class="sb-slot-control ' + (hasImage ? 'has-image' : 'is-empty') + (active ? ' is-active' : '') + '" style="left:' + left.toFixed(4) + '%;top:' + top.toFixed(4) + '%;width:' + width.toFixed(4) + '%;height:' + height.toFixed(4) + '%;transform:rotate(' + rotate.toFixed(3) + 'deg)">';
        h += '<div class="sb-slot-control-inner"></div>';
        h += '<div style="position:absolute;left:6px;top:6px;background:rgba(255,255,255,.9);border-radius:999px;padding:2px 7px;font-size:.66rem;font-weight:900;color:#4D493F;pointer-events:none;border:' + (active ? '1px solid ' + preset.accent : '1px solid rgba(234,217,207,.9)') + '">' + (idx + 1) + '</div>';
        h += '</div>';
      }
      layer.innerHTML = h;
      sbNormalizeButtons(layer);
    }

    function sbRectFromFrameSlot(frameSlot) {
      return {
        x: Number(frameSlot.x || 0),
        y: Number(frameSlot.y || 0),
        w: Number(frameSlot.w || frameSlot.width || 1),
        h: Number(frameSlot.h || frameSlot.height || 1),
        rotate: Number(frameSlot.rotate || 0)
      };
    }

    function sbSlotRegionMetrics(slotRect, region) {
      var ix = Math.max(slotRect.x, region.x);
      var iy = Math.max(slotRect.y, region.y);
      var ax = Math.min(slotRect.x + slotRect.w, region.x + region.w);
      var ay = Math.min(slotRect.y + slotRect.h, region.y + region.h);
      var intersection = Math.max(0, ax - ix) * Math.max(0, ay - iy);
      var slotArea = Math.max(1, slotRect.w * slotRect.h);
      var regionArea = Math.max(1, region.w * region.h);
      var cx = slotRect.x + slotRect.w / 2;
      var cy = slotRect.y + slotRect.h / 2;
      var centerInside = cx >= region.x && cx <= region.x + region.w && cy >= region.y && cy <= region.y + region.h;
      var slotRatio = intersection / slotArea;
      var regionRatio = intersection / regionArea;
      return {
        centerInside: centerInside,
        slotRatio: slotRatio,
        regionRatio: regionRatio,
        score: (centerInside ? 1000 : 0) + slotRatio * 100 + regionRatio * 20 - Math.log(regionArea) * .001
      };
    }

    function sbSlotBelongsToRegion(slotRect, region) {
      var metrics = sbSlotRegionMetrics(slotRect, region);
      return metrics.centerInside || metrics.slotRatio >= .2;
    }

    function sbCardSlotGroupsForEdit(pageSlots, regions) {
      var groups = regions.map(function (region, regionIndex) {
        return { region: region, regionIndex: regionIndex, slotItems: [] };
      });
      if (!groups.length) return groups;
      pageSlots.forEach(function (frameSlot, localSlot) {
        var slotRect = sbRectFromFrameSlot(frameSlot);
        var bestIndex = -1;
        var bestScore = -Infinity;
        var nearestIndex = -1;
        var nearestDistance = Infinity;
        var bestMetrics = null;
        regions.forEach(function (region, regionIndex) {
          var metrics = sbSlotRegionMetrics(slotRect, region);
          var slotCx = slotRect.x + slotRect.w / 2;
          var slotCy = slotRect.y + slotRect.h / 2;
          var regionCx = region.x + region.w / 2;
          var regionCy = region.y + region.h / 2;
          var distance = Math.pow(slotCx - regionCx, 2) + Math.pow(slotCy - regionCy, 2);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = regionIndex;
          }
          if (metrics.score > bestScore) {
            bestScore = metrics.score;
            bestIndex = regionIndex;
            bestMetrics = metrics;
          }
        });
        if (bestIndex < 0) bestIndex = nearestIndex;
        if (bestIndex < 0) return;
        if (bestMetrics && !bestMetrics.centerInside && bestMetrics.slotRatio <= 0 && bestMetrics.regionRatio <= 0 && nearestIndex >= 0) {
          bestIndex = nearestIndex;
        }
        groups[bestIndex].slotItems.push({ localSlot: localSlot, frameSlot: frameSlot });
      });
      return groups;
    }

    function sbRegionContainsRegion(parent, child) {
      var pad = 4;
      var parentArea = Math.max(1, parent.w * parent.h);
      var childArea = Math.max(1, child.w * child.h);
      if (childArea >= parentArea * .86) return false;
      return child.x >= parent.x - pad
        && child.y >= parent.y - pad
        && child.x + child.w <= parent.x + parent.w + pad
        && child.y + child.h <= parent.y + parent.h + pad;
    }

    function sbLeafCardRegions(regions) {
      if (!regions || regions.length < 2) return regions || [];
      return regions.filter(function (region, idx) {
        return !regions.some(function (other, otherIdx) {
          return otherIdx !== idx && sbRegionContainsRegion(region, other);
        });
      });
    }

    function sbSortCardRegions(regions) {
      return (regions || []).slice().sort(function (a, b) {
        var rowTolerance = Math.max(24, Math.min(Number(a.h || 1), Number(b.h || 1)) * .16);
        if (Math.abs(Number(a.y || 0) - Number(b.y || 0)) > rowTolerance) return Number(a.y || 0) - Number(b.y || 0);
        return Number(a.x || 0) - Number(b.x || 0);
      });
    }

    function sbCardRegionLabel(region, index) {
      var label = String(region && (region.label || region.name) || '').trim();
      return label || ('Card ' + (Number(index || 0) + 1));
    }

    function sbSafeCardLabelStem(label, fallback) {
      var text = String(label || fallback || 'card').trim().toLowerCase();
      if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      text = text.replace(/đ/g, 'd').replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
      return text || fallback || 'card';
    }

    function sbCardRegionsForEdit(pageIndex, cardW, cardH) {
      var regions = sbPresetCardRegions(pageIndex);
      if (regions.length) return regions;
      return [{ x: 0, y: 0, w: cardW, h: cardH }];
    }

    function sbOverlayCropHtml(preset, region, cardW, cardH) {
      if (!preset || !preset.overlayUrl) return '';
      var left = region.w ? (-region.x / region.w) * 100 : 0;
      var top = region.h ? (-region.y / region.h) * 100 : 0;
      var width = region.w ? (cardW / region.w) * 100 : 100;
      var height = region.h ? (cardH / region.h) * 100 : 100;
      return '<div class="sb-small-card-overlay"><img src="' + escAttr(preset.overlayUrl) + '" alt="" loading="lazy" onload="window.sbScheduleSmartCardPacking&&window.sbScheduleSmartCardPacking()" onerror="window.sbScheduleSmartCardPacking&&window.sbScheduleSmartCardPacking()" style="left:' + left.toFixed(4) + '%;top:' + top.toFixed(4) + '%;width:' + width.toFixed(4) + '%;height:' + height.toFixed(4) + '%"></div>';
    }

    function sbSmallCardSlotHtml(idx, slot, frameSlot, region, preset, forceRegion) {
      var slotRect = sbRectFromFrameSlot(frameSlot);
      if (!forceRegion && !sbSlotBelongsToRegion(slotRect, region)) return '';
      var active = idx === sbActive;
      var left = ((slotRect.x - region.x) / region.w) * 100;
      var top = ((slotRect.y - region.y) / region.h) * 100;
      var width = (slotRect.w / region.w) * 100;
      var height = (slotRect.h / region.h) * 100;
      var hasImage = Boolean(slot && slot.src);
      var plusSize = 'clamp(18px,' + Math.max(2.6, Math.min(width, height) * .72).toFixed(2) + 'vw,46px)';
      if (slot) sbConstrainSlot(slot, frameSlot);
      var geometryStyle = 'left:' + left.toFixed(4) + '%;top:' + top.toFixed(4) + '%;width:' + width.toFixed(4) + '%;height:' + height.toFixed(4) + '%;transform:rotate(' + slotRect.rotate.toFixed(3) + 'deg)';
      var baseStyle = geometryStyle + ';border:1px solid rgba(222,210,189,.9);background:' + preset.slotBg + ';border-radius:8px';
      var controlBorder = active ? '1px solid rgba(255,255,255,.72)' : '1px solid rgba(222,210,189,.9)';
      var controlShadow = active ? ('0 0 0 3px ' + preset.accent + ' inset') : 'none';
      var controlStyle = geometryStyle + ';--slot-plus-size:' + plusSize + ';touch-action:' + (hasImage ? 'none' : 'manipulation') + ';border:' + controlBorder + ';box-shadow:' + controlShadow + ';border-radius:8px';
      var base = '<div data-sb-slot="' + idx + '" class="sb-small-card-slot-base" style="' + baseStyle + '">';
      if (hasImage) {
        base += '<img src="' + escAttr(slot.src) + '" alt="" draggable="false" onload="sbRememberSlotImageSize(' + idx + ',this)" style="' + sbSlotImageStyle(slot, frameSlot) + '">';
      }
      base += '</div>';
      var control = '<div data-sb-slot="' + idx + '" class="sb-small-card-slot-control" onclick="' + (hasImage ? 'sbSetSlot(' + idx + ',true)' : 'sbUpload(' + idx + ')') + '" onpointerdown="' + (hasImage ? 'sbStartDrag(event,' + idx + ')' : '') + '" style="' + controlStyle + '">';
      if (!hasImage) control += '<div class="sb-empty-slot-hint"><div><b>+</b></div></div>';
      control += '<div class="sb-slot-preview-num" data-sb-real-slot="' + idx + '" style="position:absolute;left:5px;top:5px;background:rgba(255,255,255,.92);border-radius:999px;padding:2px 6px;font-size:.62rem;font-weight:900;color:#4D493F;z-index:9">' + (idx + 1) + '</div>';
      control += '</div>';
      return { base: base, control: control };
    }

    function sbUpdatePreviewSlotNumbers(grid) {
      if (!grid || !grid.querySelectorAll) return;
      var labels = Array.prototype.map.call(grid.querySelectorAll('.sb-slot-preview-num'), function (label) {
        var control = label.closest && label.closest('[data-sb-slot]');
        if (!control || !control.getBoundingClientRect) return null;
        var rect = control.getBoundingClientRect();
        return {
          label: label,
          top: rect.top,
          left: rect.left,
          slotIndex: Number(control.getAttribute('data-sb-slot') || 0)
        };
      }).filter(Boolean);
      labels.sort(function (a, b) {
        if (Math.abs(a.top - b.top) > 8) return a.top - b.top;
        return a.left - b.left;
      });
      labels.forEach(function (entry) {
        entry.label.textContent = String(entry.slotIndex + 1);
        entry.label.title = 'Slot thật ' + (entry.slotIndex + 1);
      });
    }

    function sbCardHasOverlappingSlots(items) {
      var bounds = items.map(function (item) {
        var rect = sbRectFromFrameSlot(item.frameSlot || {});
        var angle = rect.rotate * Math.PI / 180;
        var w = Math.abs(rect.w * Math.cos(angle)) + Math.abs(rect.h * Math.sin(angle));
        var h = Math.abs(rect.w * Math.sin(angle)) + Math.abs(rect.h * Math.cos(angle));
        var cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
      });
      return bounds.some(function (a, index) {
        return bounds.slice(index + 1).some(function (b) {
          return Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
        });
      });
    }

    function sbApplySmartCardPacking(targetGrid) {
      var grid = targetGrid || $('sbFrameSlots');
      if (!grid || !grid.querySelectorAll) return;
      var items = grid.querySelectorAll('.sb-small-card-edit-tile');
      if (!items.length) {
        sbFinishSmartCardPacking(grid);
        return;
      }
      var styles = window.getComputedStyle ? window.getComputedStyle(grid) : null;
      var rowHeight = styles ? parseFloat(styles.getPropertyValue('grid-auto-rows')) : 6;
      var rowGap = styles ? parseFloat(styles.getPropertyValue('row-gap') || styles.getPropertyValue('gap')) : 12;
      if (!(rowHeight > 0)) rowHeight = 6;
      if (!(rowGap >= 0)) rowGap = 12;
      var apply = function () {
        Array.prototype.forEach.call(items, function (item) {
          item.style.gridColumn = '';
          item.style.gridRowStart = '';
          item.style.gridRowEnd = 'auto';
        });
        var colEnds = [1, 1];
        var packItems = Array.prototype.map.call(items, function (item) {
          var head = item.querySelector && item.querySelector('.sb-small-card-edit-head');
          var canvas = item.querySelector && item.querySelector('.sb-small-card-edit-canvas');
          var headHeight = head && head.getBoundingClientRect ? head.getBoundingClientRect().height : 0;
          var canvasHeight = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect().height : 0;
          var measuredHeight = headHeight + canvasHeight;
          var height = measuredHeight > 0 ? measuredHeight : (item.getBoundingClientRect ? item.getBoundingClientRect().height : item.offsetHeight);
          var isFullRow = item.classList && item.classList.contains('is-fullrow');
          var ratio = parseFloat(item.getAttribute('data-sb-region-ratio') || '1');
          var slotCount = parseInt(item.getAttribute('data-sb-slot-count') || '0', 10);
          return {
            item: item,
            isFullRow: isFullRow,
            isLoosePortrait: !isFullRow && ratio < 1,
            isLooseLandscape: isFullRow && ratio >= 1 && slotCount > 0 && slotCount <= 3,
            height: Number(height || 0),
            span: Math.max(1, Math.ceil((Number(height || 0) + rowGap) / (rowHeight + rowGap)))
          };
        });
        var used = packItems.map(function () { return false; });
        var deferredLooseItems = [];
        var pendingLooseIndex = -1;
        var pendingLooseRowStart = 1;
        function clearPlacement(entry) {
          entry.item.style.gridColumn = '';
          entry.item.style.gridRowStart = '';
          entry.item.style.gridRowEnd = 'auto';
        }
        function deferLoose(index) {
          if (index < 0 || deferredLooseItems.indexOf(index) >= 0) return;
          clearPlacement(packItems[index]);
          used[index] = true;
          deferredLooseItems.push(index);
          if (pendingLooseIndex === index) pendingLooseIndex = -1;
        }
        function placeFull(entry) {
          var rowStart = Math.max(colEnds[0], colEnds[1]);
          var rowEnd = rowStart + entry.span;
          entry.item.style.gridColumn = '1 / -1';
          entry.item.style.gridRowStart = String(rowStart);
          entry.item.style.gridRowEnd = 'span ' + entry.span;
          colEnds[0] = rowEnd;
          colEnds[1] = rowEnd;
        }
        function placeSmall(entry, colIndex, rowStart) {
          entry.item.style.gridColumn = String(colIndex + 1);
          entry.item.style.gridRowStart = String(rowStart);
          entry.item.style.gridRowEnd = 'span ' + entry.span;
          return rowStart + entry.span;
        }
        function fillOpenBandWith(index) {
          var entry = packItems[index];
          var rowStart;
          var rowEnd;
          var colIndex = colEnds[0] <= colEnds[1] ? 0 : 1;
          var bandEnd = Math.max(colEnds[0], colEnds[1]);
          rowStart = colEnds[colIndex];
          rowEnd = rowStart + entry.span;
          var tolerantHeight = Math.max(1, Number(entry.height || 0) - SB_SMART_PACK_TOLERANCE_PX);
          var tolerantSpan = Math.max(1, Math.ceil((tolerantHeight + rowGap) / (rowHeight + rowGap)));
          if (rowStart + tolerantSpan > bandEnd) return false;
          rowEnd = placeSmall(entry, colIndex, rowStart);
          if (rowEnd >= bandEnd) {
            var nextBandEnd = Math.max(bandEnd, rowEnd);
            colEnds = [nextBandEnd, nextBandEnd];
          } else {
            colEnds[colIndex] = rowEnd;
            colEnds[1 - colIndex] = bandEnd;
          }
          used[index] = true;
          pendingLooseIndex = -1;
          return true;
        }
        function closeOpenBand() {
          var bandEnd = Math.max(colEnds[0], colEnds[1]);
          colEnds = [bandEnd, bandEnd];
          pendingLooseIndex = -1;
        }
        function findLaterLooseLandscape(startIndex) {
          for (var j = startIndex + 1; j < packItems.length; j++) {
            if (used[j]) continue;
            if (packItems[j].isLooseLandscape) return j;
            if (packItems[j].isFullRow && !packItems[j].isLooseLandscape) return -1;
          }
          return -1;
        }
        function findLaterLoosePortraitPair(startIndex) {
          var found = [];
          for (var j = startIndex + 1; j < packItems.length; j++) {
            if (used[j]) continue;
            if (packItems[j].isLoosePortrait) {
              found.push(j);
              if (found.length >= 2) return found;
            }
            if (packItems[j].isFullRow && !packItems[j].isLooseLandscape) break;
          }
          return [];
        }
        function placeLoosePortraitPair(pair) {
          var rowStart = Math.max(colEnds[0], colEnds[1]);
          var firstEnd = placeSmall(packItems[pair[0]], 0, rowStart);
          var secondEnd = placeSmall(packItems[pair[1]], 1, rowStart);
          var nextBandEnd = Math.max(firstEnd, secondEnd);
          colEnds = [nextBandEnd, nextBandEnd];
          used[pair[0]] = true;
          used[pair[1]] = true;
        }
        for (var i = 0; i < packItems.length; i++) {
          if (used[i]) continue;
          var entry = packItems[i];
          if (entry.isFullRow) {
            if (colEnds[0] !== colEnds[1]) {
              for (var lookahead = i + 1; lookahead < packItems.length; lookahead++) {
                if (!used[lookahead] && !packItems[lookahead].isFullRow && fillOpenBandWith(lookahead) && colEnds[0] === colEnds[1]) break;
              }
              if (colEnds[0] !== colEnds[1]) {
                if (pendingLooseIndex >= 0) {
                  var resetRow = pendingLooseRowStart;
                  deferLoose(pendingLooseIndex);
                  colEnds = [resetRow, resetRow];
                } else {
                  closeOpenBand();
                }
              }
            }
            placeFull(entry);
            used[i] = true;
            continue;
          }
          if (colEnds[0] === colEnds[1]) {
            if (entry.isLoosePortrait) {
              var landscapeIndex = findLaterLooseLandscape(i);
              if (landscapeIndex >= 0) {
                placeFull(packItems[landscapeIndex]);
                used[landscapeIndex] = true;
              }
              var portraitPair = findLaterLoosePortraitPair(i);
              if (portraitPair.length >= 2) placeLoosePortraitPair(portraitPair);
            }
            rowEnd = placeSmall(entry, 0, colEnds[0]);
            pendingLooseIndex = i;
            pendingLooseRowStart = colEnds[0];
            colEnds[0] = rowEnd;
            used[i] = true;
            continue;
          }
          if (!fillOpenBandWith(i)) {
            deferLoose(i);
          }
        }
        if (pendingLooseIndex >= 0 && colEnds[0] !== colEnds[1]) {
          var deferredStart = pendingLooseRowStart;
          deferLoose(pendingLooseIndex);
          colEnds = [deferredStart, deferredStart];
        } else if (colEnds[0] !== colEnds[1]) {
          closeOpenBand();
        }
        deferredLooseItems.forEach(function (index) {
          var entry = packItems[index];
          if (colEnds[0] === colEnds[1]) {
            var rowEnd = placeSmall(entry, 0, colEnds[0]);
            colEnds[0] = rowEnd;
            return;
          }
          var colIndex = colEnds[0] <= colEnds[1] ? 0 : 1;
          placeSmall(entry, colIndex, colEnds[colIndex]);
          closeOpenBand();
        });
        sbUpdatePreviewSlotNumbers(grid);
        sbFinishSmartCardPacking(grid);
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(apply);
      else apply();
    }

    function sbStartSmartCardPacking(grid) {
      if (!grid || !grid.classList) return;
      var height = grid.getBoundingClientRect ? grid.getBoundingClientRect().height : grid.offsetHeight;
      if (height > 40) grid.style.minHeight = Math.ceil(height) + 'px';
      grid.classList.add('is-packing');
    }

    function sbFinishSmartCardPacking(grid) {
      if (!grid || !grid.classList) return;
      grid.classList.remove('is-packing');
      grid.style.minHeight = '';
    }

    function sbScheduleSmartCardPacking() {
      if (sbSmartPackTimer) window.clearTimeout(sbSmartPackTimer);
      var run = function () {
        sbSmartPackTimer = null;
        sbApplySmartCardPacking();
      };
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(run);
        });
      }
      sbSmartPackTimer = window.setTimeout(run, 160);
    }
    window.sbScheduleSmartCardPacking = sbScheduleSmartCardPacking;

    function sbScrollContainer() {
      return $('ptb-app') || document.scrollingElement || document.documentElement || document.body;
    }

    function sbPreserveSlotViewport(slotIdx, work) {
      slotIdx = Math.max(0, Math.min(sbTotalSlots() - 1, Number(slotIdx || 0)));
      var selector = '[data-sb-slot="' + slotIdx + '"]';
      var anchor = document.querySelector(selector);
      var beforeTop = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect().top : null;
      var scroller = sbScrollContainer();
      var useElementScroll = Boolean(scroller && scroller !== document.documentElement && scroller !== document.body);

      function restore() {
        if (beforeTop === null) return;
        var nextAnchor = document.querySelector(selector);
        if (!nextAnchor || !nextAnchor.getBoundingClientRect) return;
        var afterTop = nextAnchor.getBoundingClientRect().top;
        var delta = afterTop - beforeTop;
        if (Math.abs(delta) <= 1) return;
        if (useElementScroll) scroller.scrollTop += delta;
        else window.scrollBy(0, delta);
      }

      var result = work();
      if (window.requestAnimationFrame) window.requestAnimationFrame(restore);
      else window.setTimeout(restore, 0);
      window.setTimeout(restore, 90);
      window.setTimeout(restore, 260);
      window.setTimeout(restore, 620);
      return result;
    }

    function sbRenderSlots() {
      var wrap = $('sbFrameSlots');
      if (!wrap) return;
      sbEnsureSlotLength();
      var preset = sbPreset(sbPage);
      sbFramePresetId = preset.id;
      var slotsPerPage = sbSlotsPerPage(sbPage);
      var start = sbPageSlotStart(sbPage);
      var cardW = Number(preset.width || 1200);
      var cardH = Number(preset.height || 1800);
      var pageSlots = sbPresetPageSlots(preset, sbPage, cardW);
      var regions = sbCardRegionsForEdit(sbPage, cardW, cardH);
      var cardGroups = sbCardSlotGroupsForEdit(pageSlots.slice(0, slotsPerPage), regions);
      var h = '';
      cardGroups.forEach(function (group) {
        var region = group.region;
        var slotsInCard = [];
        var filledInCard = 0;
        var slotBaseHtml = '';
        var slotControlHtml = '';
        group.slotItems.slice().sort(sbCompareSlotLayers).forEach(function (item) {
          var j = item.localSlot;
          var idx = start + j;
          var frameSlot = item.frameSlot || pageSlots[j] || sbDefaultPageSlots(cardW)[j % SB_DEFAULT_SLOTS_PER_PAGE];
          slotsInCard.push(idx);
          if (sbSlots[idx] && sbSlots[idx].src) filledInCard += 1;
          var slotLayers = sbSmallCardSlotHtml(idx, sbSlots[idx], frameSlot, region, preset, true);
          if (slotLayers) {
            slotBaseHtml += slotLayers.base || '';
            slotControlHtml += slotLayers.control || '';
          }
        });
        if (!slotsInCard.length) return;
        var cardNo = group.regionIndex + 1;
        var regionRatio = Number(region.w || 1) / Math.max(1, Number(region.h || 1));
        var isPortraitCard = regionRatio < 1;
        var cardLayoutClass = (regionRatio < .5 || (isPortraitCard && slotsInCard.length <= 2)) ? ' is-skinny-portrait' : ' is-fullrow';
        h += '<div class="sb-small-card-edit-tile' + cardLayoutClass + '" data-sb-region-ratio="' + regionRatio.toFixed(4) + '" data-sb-slot-count="' + slotsInCard.length + '">';
        h += '<div class="sb-small-card-edit-head"><span>' + esc(sbCardRegionLabel(region, cardNo - 1)) + '</span><span>' + filledInCard + '/' + slotsInCard.length + ' slot</span></div>';
        h += '<div class="sb-small-card-edit-canvas" style="--sb-card-ratio:' + Number(region.w || 1) + ' / ' + Number(region.h || 1) + ';background:' + escAttr(preset.bg || '#FCFAF5') + '">';
        h += slotBaseHtml;
        h += sbOverlayCropHtml(preset, region, cardW, cardH);
        h += slotControlHtml;
        h += '</div>';
        if (sbCardHasOverlappingSlots(group.slotItems)) {
          h += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px" aria-label="Chọn slot ảnh">';
          slotsInCard.forEach(function (slotIdx) {
            var filled = Boolean(sbSlots[slotIdx] && sbSlots[slotIdx].src);
            h += '<button type="button" onclick="' + (filled ? 'sbSetSlot(' + slotIdx + ',true)' : 'sbUpload(' + slotIdx + ')') + '" style="min-height:36px;padding:6px 10px;font-size:.75rem" aria-label="' + (filled ? 'Chỉnh' : 'Tải ảnh cho') + ' slot ' + (slotIdx + 1) + '">Slot ' + (slotIdx + 1) + '</button>';
          });
          h += '</div>';
        }
        h += '</div>';
      });
      if (!h) h = '<div class="sb-small-card-empty">Frame này chưa có vùng card nhỏ. Hãy chọn frame khác hoặc báo thu ngân kiểm tra frame.</div>';
      sbStartSmartCardPacking(wrap);
      wrap.innerHTML = h;
      sbNormalizeButtons(wrap);
      sbApplyFramePreset();
      sbRenderSlotControls(start, slotsPerPage, pageSlots, cardW, cardH, preset);
      var label = $('sbPageLabel');
      var progress = $('sbProgress');
      if (label) label.textContent = sbPageLabelText();
      if (progress) progress.style.width = (((sbPage + 1) / sbTotalPages()) * 100).toFixed(2) + '%';
      sbSyncControls();
      sbRenderPicker();
      sbRenderFrameQuickPick();
      sbRenderPtcardComposer();
      sbScheduleSmartCardPacking();
      window.setTimeout(sbScheduleSmartCardPacking, 320);
      window.setTimeout(sbScheduleSmartCardPacking, 900);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          sbScheduleSmartCardPacking();
        }).catch(function () {});
      }
    }

    function sbSyncTabs() {
      var expired = sbIsEditExpired();
      if (expired && sbTab === 'frame') sbTab = 'gallery';
      var tabs = [
        ['gallery', $('sbTabGallery'), $('sbTabBtnGallery')],
        ['frame', $('sbTabFrame'), $('sbTabBtnFrame')],
        ['submitted', $('sbTabSubmitted'), $('sbTabBtnSubmitted')]
      ];
      tabs.forEach(function (item) {
        if (item[1]) item[1].style.display = item[0] === sbTab ? 'block' : 'none';
        if (item[2]) item[2].className = item[0] === sbTab ? 'sb-tab is-active' : 'sb-tab';
        if (item[0] === 'frame' && item[2]) {
          item[2].disabled = expired;
          item[2].title = expired ? sbEditExpiredMessage() : 'Tải ảnh đã chỉnh lên slot, zoom/check, rồi gửi về thu ngân trong vòng 3 ngày.';
        }
      });
    }

    function sbSyncControls() {
      var slot = sbSlots[sbActive];
      var zoom = slot ? Math.round(Math.max(1, Number(slot.zoom || 1)) * 100) : 100;
      var range = $('sbZoomRange');
      var label = $('sbZoomValue');
      var panel = $('sbEditPanel');
      var panelShell = $('sbBottomEditor') || (panel && panel.parentNode);
      var floatingSubmit = $('sbFloatingSubmit');
      var slotLabel = $('sbActiveSlotLabel');
      var slotTop = $('sbActiveSlotTop');
      var uploadLabel = $('sbUploadSlotLabel');
      var summary = $('sbSubmitSummary');
      if (range) {
        var minZoom = slot ? Math.round(Math.max(1, Number(slot.minZoom || 1)) * 100) : 100;
        range.min = String(minZoom);
        range.max = String(Math.max(250, minZoom + 160));
        range.value = String(zoom);
      }
      if (label) label.textContent = zoom + '%';
        var rotateText = slot ? sbNormalizeRotation(slot.rotate).toFixed(1).replace(/\.0$/, '') : '0';
      var rotateRange = $('sbRotateRange');
      var rotateInput = $('sbRotateInput');
      var rotateLabel = $('sbRotateValue');
      if (rotateRange) rotateRange.value = rotateText;
      if (rotateInput) rotateInput.value = rotateText;
      if (rotateLabel) rotateLabel.textContent = rotateText + '°';
      if (slotLabel) slotLabel.textContent = String(sbActive + 1);
      if (slotTop) slotTop.textContent = String(sbActive + 1);
      if (uploadLabel) uploadLabel.textContent = String(sbActive + 1);
      var panelVisible = Boolean(!sbIsEditExpired() && sbEditPanelOpen && slot && slot.src && sbTab === 'frame');
      if (panelShell) {
        panelShell.style.display = panelVisible ? 'block' : 'none';
        if (panelShell.classList) panelShell.classList.toggle('is-open', panelVisible);
      }
      if (panel) panel.style.display = panelVisible ? 'block' : 'none';
      if (floatingSubmit) floatingSubmit.style.display = panelVisible ? 'none' : '';
      if (panelVisible) {
        sbUpdateMobileViewportInset();
        window.setTimeout(sbUpdateMobileViewportInset, 80);
      }
      if (panel) {
        var chooseBtn = panel.querySelector("button[onclick=\"sbSetTab('gallery')\"]");
        if (chooseBtn) {
          chooseBtn.setAttribute('onclick', 'sbOpenPicker(sbActive)');
          chooseBtn.textContent = 'Chọn ảnh khác';
        }
      }
      if (summary) {
        var chosen = sbSlots.filter(function (item) { return item && item.src; }).length;
        var selectedPages = sbSelectedPageIndexes();
        summary.textContent = chosen
          ? ('Đã chọn ' + chosen + '/' + sbTotalSlots() + ' slot trên ' + selectedPages.length + '/' + sbTotalPages() + ' tờ. Khi gửi chỉ gửi các tờ đã có ảnh.')
          : 'Chưa chọn ảnh nào.';
      }
      var topTitle = $('sbFrameTitleTop');
      if (topTitle) topTitle.innerHTML = 'Slot đang chọn <span id="sbActiveSlotTop">' + (sbActive + 1) + '</span>/' + sbTotalSlots() + ' slot · ' + sbTotalPages() + ' tấm';
      var totalPages = sbTotalPages();
      var prevBtn = $('sbPrevPageBtn');
      var nextBtn = $('sbNextPageBtn');
      if (prevBtn) prevBtn.disabled = sbIsEditExpired() || totalPages <= 1 || sbPage <= 0;
      if (nextBtn) nextBtn.disabled = sbIsEditExpired() || totalPages <= 1 || sbPage >= totalPages - 1;
      sbSyncTabs();
    }

    function sbMiniImageListHtml(slotIdx) {
      if (!sbImages.length) {
        return '<div style="padding:12px;color:#766E60;font-weight:800">Chưa có ảnh sẵn trong Drive.</div>';
      }
      return '<div class="sb-mini-strip">' + sbImages.map(function (f, idx) {
        var thumb = f.previewUrl || f.thumbnailUrl || f.originalImageUrl || '';
        return '<button class="sb-mini-photo" onclick="sbPickDriveToSlot(' + idx + ',' + slotIdx + ')"><img src="' + thumb + '" alt=""><span style="display:block;padding:5px 6px;font-size:.68rem;color:#4D493F">Ảnh ' + (idx + 1) + '</span></button>';
      }).join('') + '</div>';
    }

    function sbRenderPicker() {
      var picker = $('sbSlotPicker');
      if (!picker) return;
      if (sbTab !== 'frame' || sbPickerSlot < 0 || sbPickerSlot >= sbTotalSlots()) {
        picker.style.display = 'none';
        picker.innerHTML = '';
        return;
      }
      picker.style.display = 'block';
      picker.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px"><div><strong style="color:#4D493F">Chọn ảnh cho slot ' + (sbPickerSlot + 1) + '</strong><div class="sb-note" style="margin:2px 0 0">Vuốt ngang để chọn ảnh đã có sẵn. Muốn tải ảnh mới, bấm dấu + ngay trên slot trống.</div></div><button onclick="sbClosePicker()" style="width:34px;height:34px;padding:0">x</button></div>' + sbMiniImageListHtml(sbPickerSlot);
      sbNormalizeButtons(picker);
    }

    function sbAssignDriveToSlot(imageIdx, slotIdx, autoAdvance) {
      var f = sbImages[imageIdx];
      if (!f) return;
      slotIdx = Math.max(0, Math.min(sbTotalSlots() - 1, Number(slotIdx || 0)));
      var preserveSlotIdx = slotIdx;
      sbSlots[slotIdx] = { src: f.originalImageUrl || f.previewUrl || f.thumbnailUrl, name: f.name, source: 'drive', id: f.id, zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, flipX: false, autoFit: true };
      sbInvalidateCardPreview();
      sbActive = slotIdx;
      sbPage = sbPageForSlotIndex(sbActive);
      sbTab = 'frame';
      sbEditPanelOpen = true;
      sbPickerSlot = -1;
      if (autoAdvance) {
        for (var i = 0; i < sbSlots.length; i++) {
          if (!sbSlots[i]) {
            sbActive = i;
            sbPage = sbPageForSlotIndex(sbActive);
            sbEditPanelOpen = false;
            break;
          }
        }
      }
      sbPreserveSlotViewport(preserveSlotIdx, function () {
        sbRenderSlots();
      });
    }

    window.sbSetTab = function (tab) {
      if (tab === 'frame' && !sbRequireEditOpen()) return;
      sbTab = tab === 'frame' ? 'frame' : (tab === 'submitted' ? 'submitted' : 'gallery');
      if (sbTab !== 'frame') {
        sbEditPanelOpen = false;
        sbPickerSlot = -1;
      }
      sbSyncControls();
      sbRenderPicker();
      if (sbTab === 'submitted') sbRenderSubmittedCards();
    };

    function sbSetEditPanel(open) {
      sbEditPanelOpen = Boolean(open);
      sbSyncControls();
    }

    window.sbCloseEditPanel = function () {
      sbSetEditPanel(false);
    };

    window.sbSetZoom = function (value) {
      if (sbIsEditExpired()) {
        sbSyncControls();
        return;
      }
      var slot = sbSlots[sbActive];
      if (!slot) {
        sbSyncControls();
        return;
      }
      slot.autoFit = false;
      slot.zoom = Math.max(Number(slot.minZoom || 1), Number(value || 100) / 100);
      sbConstrainSlot(slot, sbFrameSlotForIndex(sbActive));
      sbInvalidateCardPreview({ keepPreview: true });
      sbUpdateSlotDom(sbActive);
    };

    window.sbSetRotate = function (value) {
      if (sbIsEditExpired()) {
        sbSyncControls();
        return;
      }
      var slot = sbSlots[sbActive];
      if (!slot) {
        sbSyncControls();
        return;
      }
      slot.autoFit = false;
      slot.rotate = sbNormalizeRotation(value);
      sbConstrainSlot(slot, sbFrameSlotForIndex(sbActive));
      sbInvalidateCardPreview({ keepPreview: true });
      sbUpdateSlotDom(sbActive);
    };

    window.sbBumpRotate = function (delta) {
      var slot = sbSlots[sbActive];
      var current = slot ? Number(slot.rotate || 0) : 0;
      window.sbSetRotate(current + Number(delta || 0));
    };

    window.sbFlipActive = function () {
      if (sbIsEditExpired()) {
        sbSyncControls();
        return;
      }
      var slot = sbSlots[sbActive];
      if (!slot) {
        sbSyncControls();
        return;
      }
      slot.flipX = !slot.flipX;
      slot.autoFit = false;
      sbInvalidateCardPreview({ keepPreview: true });
      sbUpdateSlotDom(sbActive);
    };

    function sbGesturePointList(idx) {
      return Object.keys(sbGesturePointers).map(function (key) { return sbGesturePointers[key]; }).filter(function (point) {
        return point && point.idx === idx;
      });
    }

    function sbGestureDistance(a, b) {
      var dx = Number(a.clientX || 0) - Number(b.clientX || 0);
      var dy = Number(a.clientY || 0) - Number(b.clientY || 0);
      return Math.max(1, Math.sqrt(dx * dx + dy * dy));
    }

    function sbGestureCenter(a, b) {
      return {
        x: (Number(a.clientX || 0) + Number(b.clientX || 0)) / 2,
        y: (Number(a.clientY || 0) + Number(b.clientY || 0)) / 2
      };
    }

    function sbStartPinchGesture(idx, target) {
      var points = sbGesturePointList(idx);
      if (points.length < 2) return false;
      var slot = sbSlots[idx];
      if (!slot) return false;
      var box = target.getBoundingClientRect();
      var center = sbGestureCenter(points[0], points[1]);
      sbDragState = {
        mode: 'pinch',
        idx: idx,
        target: target,
        dragging: true,
        boxW: Math.max(1, box.width),
        boxH: Math.max(1, box.height),
        startDistance: sbGestureDistance(points[0], points[1]),
        startCenterX: center.x,
        startCenterY: center.y,
        startZoom: Number(slot.zoom || 1),
        offsetX: Number(slot.offsetX || 0),
        offsetY: Number(slot.offsetY || 0)
      };
      return true;
    }

    window.sbStartDrag = function (event, idx) {
      if (sbIsEditExpired()) return;
      var slot = sbSlots[idx];
      var box = event.currentTarget.getBoundingClientRect();
      if (!slot || !slot.src) return;
      if (event.cancelable) event.preventDefault();
      sbActive = Math.max(0, Math.min(sbTotalSlots() - 1, idx));
      sbPage = sbPageForSlotIndex(sbActive);
      sbEditPanelOpen = true;
      sbPickerSlot = -1;
      sbSyncControls();
      sbGesturePointers[event.pointerId] = { pointerId: event.pointerId, idx: idx, clientX: event.clientX, clientY: event.clientY };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) {}
      if (sbStartPinchGesture(idx, event.currentTarget)) return;
      sbDragState = {
        mode: 'drag',
        idx: idx,
        pointerId: event.pointerId,
        target: event.currentTarget,
        dragging: false,
        startX: event.clientX,
        startY: event.clientY,
        boxW: Math.max(1, box.width),
        boxH: Math.max(1, box.height),
        offsetX: Number(slot.offsetX || 0),
        offsetY: Number(slot.offsetY || 0)
      };
    };

    window.addEventListener('pointermove', function (event) {
      if (sbHandleExtraPointerMove(event)) return;
      if (sbGesturePointers[event.pointerId]) {
        sbGesturePointers[event.pointerId].clientX = event.clientX;
        sbGesturePointers[event.pointerId].clientY = event.clientY;
      }
      if (!sbDragState) return;
      var slot = sbSlots[sbDragState.idx];
      if (!slot) return;
      if (sbDragState.mode === 'pinch') {
        var points = sbGesturePointList(sbDragState.idx);
        if (points.length < 2) return;
        if (event.cancelable) event.preventDefault();
        var center = sbGestureCenter(points[0], points[1]);
        var ratio = sbGestureDistance(points[0], points[1]) / Math.max(1, Number(sbDragState.startDistance || 1));
        slot.autoFit = false;
        var minZoom = sbMinFillZoom(slot, sbFrameSlotForIndex(sbDragState.idx));
        var maxZoom = Math.max(2.5, minZoom + 1.6);
        slot.zoom = Math.max(minZoom, Math.min(maxZoom, Number(sbDragState.startZoom || 1) * ratio));
        slot.offsetX = Number(sbDragState.offsetX || 0) + ((center.x - Number(sbDragState.startCenterX || center.x)) / Math.max(1, sbDragState.boxW)) * 100;
        slot.offsetY = Number(sbDragState.offsetY || 0) + ((center.y - Number(sbDragState.startCenterY || center.y)) / Math.max(1, sbDragState.boxH)) * 100;
        sbConstrainSlot(slot, sbFrameSlotForIndex(sbDragState.idx));
        sbUpdateSlotDom(sbDragState.idx);
        return;
      }
      if (sbDragState.pointerId !== event.pointerId) {
        if (sbStartPinchGesture(sbDragState.idx, sbDragState.target)) return;
        return;
      }
      var dx = event.clientX - sbDragState.startX;
      var dy = event.clientY - sbDragState.startY;
      if (!sbDragState.dragging) {
        if (Math.sqrt(dx * dx + dy * dy) < 8) return;
        sbDragState.dragging = true;
        try { sbDragState.target.setPointerCapture(sbDragState.pointerId); } catch (e) {}
      }
      if (event.cancelable) event.preventDefault();
      slot.autoFit = false;
      slot.offsetX = sbDragState.offsetX + (dx / sbDragState.boxW) * 100;
      slot.offsetY = sbDragState.offsetY + (dy / sbDragState.boxH) * 100;
      sbConstrainSlot(slot, sbFrameSlotForIndex(sbDragState.idx));
      sbUpdateSlotDom(sbDragState.idx);
    });

    window.addEventListener('pointerup', function (event) {
      if (sbHandleExtraPointerEnd(event)) return;
      var finishedIdx = sbDragState && sbDragState.idx;
      var didMove = sbDragState && sbDragState.dragging;
      delete sbGesturePointers[event.pointerId];
      if (didMove) {
        sbInvalidateCardPreview({ keepPreview: true });
      }
      if (finishedIdx !== undefined && sbGesturePointList(finishedIdx).length === 1) {
        var point = sbGesturePointList(finishedIdx)[0];
        var slot = sbSlots[finishedIdx];
        var target = sbDragState && sbDragState.target;
        if (slot && target) {
          var box = target.getBoundingClientRect();
          sbDragState = {
            mode: 'drag',
            idx: finishedIdx,
            pointerId: point.pointerId,
            target: target,
            dragging: false,
            startX: point.clientX,
            startY: point.clientY,
            boxW: Math.max(1, box.width),
            boxH: Math.max(1, box.height),
            offsetX: Number(slot.offsetX || 0),
            offsetY: Number(slot.offsetY || 0)
          };
          return;
        }
      }
      sbDragState = null;
    });

    window.addEventListener('pointercancel', function (event) {
      if (sbHandleExtraPointerCancel(event)) return;
      delete sbGesturePointers[event.pointerId];
      if (sbDragState && sbDragState.dragging) {
        sbInvalidateCardPreview({ keepPreview: true });
      }
      sbDragState = null;
    });

    document.addEventListener('click', function (event) {
      if (!sbEditPanelOpen) return;
      var target = event.target;
      if (target && target.closest && (target.closest('#sbEditPanel') || target.closest('[data-sb-slot]'))) return;
      sbSetEditPanel(false);
    });

    window.sbSetFramePreset = function (presetId) {
      if (!sbRequireEditOpen()) return;
      var allowed = sbAvailableFramePresets();
      var match = null;
      for (var i = 0; i < allowed.length; i++) {
        if (allowed[i].id === presetId) {
          match = allowed[i];
          break;
        }
      }
      var pages = sbTotalPages();
      var previousByPage = [];
      for (var p = 0; p < pages; p++) {
        previousByPage[p] = sbSlots.slice(sbPageSlotStart(p), sbPageSlotStart(p) + sbSlotsPerPage(p));
      }
      var localSlot = sbActive - sbPageSlotStart(sbPage);
      sbPagePresetIds[sbPage] = (match || allowed[0] || SB_FRAME_PRESETS[0]).id;
      sbFramePresetId = sbPagePresetIds[sbPage];
      sbSlots = [];
      for (var page = 0; page < pages; page++) {
        var nextCount = sbSlotsPerPage(page);
        var oldSlots = previousByPage[page] || [];
        for (var j = 0; j < nextCount; j++) sbSlots.push(oldSlots[j] || null);
      }
      sbEnsureSlotLength();
      sbActive = sbPageSlotStart(sbPage) + Math.min(Math.max(0, localSlot), Math.max(0, sbSlotsPerPage(sbPage) - 1));
      sbInvalidateCardPreview();
      sbPickerSlot = -1;
      sbEditPanelOpen = Boolean(sbSlots[sbActive] && sbSlots[sbActive].src);
      sbRenderSlots();
    };
    window.sbSetSlot = function (idx, openPanel) {
      if (openPanel && !sbRequireEditOpen()) return;
      var slotIdx = Math.max(0, Math.min(sbTotalSlots() - 1, Number(idx || 0)));
      sbPreserveSlotViewport(slotIdx, function () {
        sbActive = slotIdx;
        sbPage = sbPageForSlotIndex(sbActive);
        sbEditPanelOpen = Boolean(openPanel && sbSlots[sbActive] && sbSlots[sbActive].src);
        if (sbEditPanelOpen) sbPickerSlot = -1;
        sbRenderSlots();
      });
    };
    window.sbPrevPage = function () { if (!sbRequireEditOpen()) return; if (sbTotalPages() <= 1 || sbPage <= 0) return; sbPage -= 1; sbActive = sbPageSlotStart(sbPage); sbEditPanelOpen = false; sbPickerSlot = -1; sbRenderSlots(); };
    window.sbNextPage = function () { if (!sbRequireEditOpen()) return; if (sbTotalPages() <= 1 || sbPage >= sbTotalPages() - 1) return; sbPage += 1; sbActive = sbPageSlotStart(sbPage); sbEditPanelOpen = false; sbPickerSlot = -1; sbRenderSlots(); };
    window.sbPickDrive = function (idx) {
      sbAssignDriveToSlot(idx, sbActive, true);
    };
    window.sbPickDriveToSlot = function (imageIdx, slotIdx) { sbAssignDriveToSlot(imageIdx, slotIdx, false); };
    window.sbOpenPicker = function (idx) { if (!sbRequireEditOpen()) return; var slotIdx = Math.max(0, Math.min(sbTotalSlots() - 1, Number(idx || 0))); sbPreserveSlotViewport(slotIdx, function () { sbActive = slotIdx; sbPage = sbPageForSlotIndex(sbActive); sbTab = 'frame'; sbEditPanelOpen = false; sbPickerSlot = sbActive; sbRenderSlots(); }); };
    window.sbClosePicker = function () { sbPickerSlot = -1; sbRenderPicker(); };
    window.sbUpload = function (idx) { if (!sbRequireEditOpen()) return; sbActive = idx; sbPage = sbPageForSlotIndex(sbActive); sbTab = 'frame'; sbEditPanelOpen = false; sbPickerSlot = -1; sbSyncControls(); var input = $('sbUploadInput'); if (input) input.click(); };
    window.sbUploadExtra = function (kind) { if (!sbRequireEditOpen()) return; if (!sbPackageExtras[kind]) return; sbExtraUploadTarget = kind; var input = $('sbExtraUploadInput'); if (input) input.click(); };
    window.sbClearActive = function () { if (!sbRequireEditOpen()) return; var slotIdx = sbActive; sbPreserveSlotViewport(slotIdx, function () { sbSlots[sbActive] = null; sbPickerSlot = -1; sbInvalidateCardPreview(); sbRenderSlots(); }); };

    function sbSetSubmitProgress(percent, message, isError) {
      percent = Math.max(0, Math.min(100, Math.round(Number(percent || 0))));
      var wrap = $('sbSubmitProgressWrap');
      var bar = $('sbSubmitProgressBar');
      var text = $('sbSubmitProgressText');
      if (wrap) wrap.style.display = 'block';
      sbSubmitProgressLayoutKey = '';
      if (bar) {
        if (bar.parentNode) bar.parentNode.style.display = '';
        bar.style.width = percent + '%';
        bar.style.background = isError ? '#B4534F' : '#536048';
      }
      if (text) {
        text.style.color = isError ? '#B4534F' : '#766E60';
        if (isError || percent >= 100 || percent <= 0) {
          text.textContent = message || 'Đang tải...';
        } else {
          text.innerHTML = (message || 'Đang tải...') + ' <span class="sb-loading-dots"></span><div style="font-size:.72rem;color:#766E60;margin-top:3px">Đừng tắt màn hình. Vui lòng đợi đến khi đủ 100% và báo gửi thành công.</div>';
        }
      }
    }

    function sbScrollSubmitProgressIntoView(repeat) {
      var wrap = $('sbSubmitProgressWrap');
      if (!wrap) return;
      var now = Date.now();
      if (!repeat && now - sbSubmitProgressLastScrollAt < 900) return;
      sbSubmitProgressLastScrollAt = now;
      (repeat ? [60, 240, 620] : [80]).forEach(function (delay) {
        window.setTimeout(function () {
          try {
            wrap.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } catch (err) {
            wrap.scrollIntoView(true);
          }
        }, delay);
      });
    }

    function sbResetSubmitProgress() {
      sbStopSoftProgress();
      sbStopCurrentUploadProgress();
      var wrap = $('sbSubmitProgressWrap');
      var bar = $('sbSubmitProgressBar');
      var text = $('sbSubmitProgressText');
      if (wrap) wrap.style.display = 'none';
      sbSubmitProgressLayoutKey = '';
      if (bar) bar.style.width = '0%';
      if (bar && bar.parentNode) bar.parentNode.style.display = '';
      if (text) {
        text.style.color = '#766E60';
        text.textContent = 'Đang chuẩn bị...';
      }
    }

    function sbStartSoftProgress(base, cap, message) {
      if (sbSubmitProgressTimer) window.clearInterval(sbSubmitProgressTimer);
      var value = Number(base || 0);
      sbSetSubmitProgress(value, message || 'Đang tải...');
      sbSubmitProgressTimer = window.setInterval(function () {
        value = Math.min(Number(cap || 95), value + Math.max(1, Math.round((Number(cap || 95) - value) * 0.08)));
        sbSetSubmitProgress(value, message || 'Đang tải...');
        if (value >= Number(cap || 95)) {
          window.clearInterval(sbSubmitProgressTimer);
          sbSubmitProgressTimer = null;
        }
      }, 650);
    }

    function sbStopSoftProgress() {
      if (sbSubmitProgressTimer) window.clearInterval(sbSubmitProgressTimer);
      sbSubmitProgressTimer = null;
    }

    function sbUploadStepText(label, state) {
      if (state === 'done') return 'Đã tải ' + label;
      if (state === 'retry') return 'Đang tải lại ' + label;
      if (state === 'error') return 'Lỗi khi tải ' + label;
      if (state === 'active') return 'Đang tải ' + label;
      return 'Chuẩn bị tải ' + label;
    }

    function sbComfortMessage(progress) {
      var messages = [
        'Chờ xíu, đang tải nè...',
        'Tải hơi lâu vì tụi mình giữ ảnh chất lượng cao.',
        'Sắp xong rồi, bạn đợi thêm chút nha.',
        'Ảnh đang được gửi về Drive để thu ngân nhận đủ file.',
        'Mạng chậm một chút nhưng ảnh vẫn đang lên đều.'
      ];
      if (Number(progress || 0) >= 88) return 'Gần xong rồi, chờ thêm chút nữa nha.';
      return messages[sbComfortIndex % messages.length];
    }

    function sbStopCurrentUploadProgress() {
      if (sbCurrentUploadTimer) window.clearInterval(sbCurrentUploadTimer);
      sbCurrentUploadTimer = null;
      Object.keys(sbParallelUploadTimers || {}).forEach(function (key) {
        window.clearInterval(sbParallelUploadTimers[key]);
      });
      sbParallelUploadTimers = {};
    }

    function sbSetSubmitStepStates(labels, states, percents, isError, comfortPercent) {
      labels = labels || [];
      states = states || [];
      percents = percents || [];
      comfortPercent = Math.max(0, Math.min(100, Number(comfortPercent || 0)));
      var wrap = $('sbSubmitProgressWrap');
      var bar = $('sbSubmitProgressBar');
      var text = $('sbSubmitProgressText');
      if (wrap) wrap.style.display = 'block';
      if (bar) {
        bar.style.width = '0%';
        bar.style.background = isError ? '#B4534F' : '';
        if (bar.parentNode) bar.parentNode.style.display = 'none';
      }
      if (!text) return;
      text.style.color = isError ? '#B4534F' : '#766E60';
      if (isError) {
        sbSubmitProgressLayoutKey = '';
        text.textContent = 'Gửi chưa thành công, hãy bấm gửi lại.';
        return;
      }
      var totalRawPercent = labels.length ? (percents.reduce(function (sum, value) {
        return sum + Math.max(0, Math.min(100, Number(value || 0)));
      }, 0) / labels.length) : 0;
      totalRawPercent = Math.max(0, Math.min(100, totalRawPercent));
      var totalPercent = Math.round(totalRawPercent);
      var layoutKey = JSON.stringify({ labels: labels, states: states });
      if (sbSubmitProgressLayoutKey !== layoutKey) {
        text.innerHTML = '<div class="sb-submit-steps">' + labels.map(function (label, idx) {
        var state = states[idx] || 'pending';
        var icon = state === 'done' ? '✓' : (state === 'error' ? '!' : (state === 'pending' ? (idx + 1) : ''));
        var rowPercent = Math.max(0, Math.min(100, Number(percents[idx] || 0)));
        var percentText = state === 'pending' ? '' : (Math.round(rowPercent) + '%');
        return '<div class="sb-submit-step is-' + state + '"><span class="sb-submit-step-icon">' + icon + '</span><span class="sb-submit-step-main"><span class="sb-submit-step-row"><span>' + esc(sbUploadStepText(label, state)) + '</span><b data-sb-step-percent="' + idx + '">' + percentText + '</b></span><span class="sb-step-progress-track"><i data-sb-step-fill="' + idx + '" class="sb-step-progress-fill" style="width:' + rowPercent.toFixed(2) + '%"></i></span></span></div>';
        }).join('') + '</div>'
          + '<div class="sb-total-label" data-sb-total-label><span>Tổng tiến trình</span><b data-sb-total-percent>' + totalPercent + '%</b></div>'
          + '<div class="sb-total-progress-track"><div data-sb-total-fill class="sb-total-progress-fill" style="width:' + totalRawPercent.toFixed(2) + '%"></div></div>'
          + '<div class="sb-comfort-message" data-sb-comfort>' + esc(sbComfortMessage(comfortPercent)) + '</div>'
          + '<div class="sb-submit-hold-note">Đừng tắt màn hình hoặc khóa máy trong lúc gửi. Vui lòng đợi đến khi đủ 100% và hiện gửi thành công.</div>';
        sbSubmitProgressLayoutKey = layoutKey;
      }
      labels.forEach(function (label, idx) {
        var state = states[idx] || 'pending';
        var rowPercent = Math.max(0, Math.min(100, Number(percents[idx] || 0)));
        var percentText = state === 'pending' ? '' : (Math.round(rowPercent) + '%');
        var percentNode = text.querySelector('[data-sb-step-percent="' + idx + '"]');
        var fillNode = text.querySelector('[data-sb-step-fill="' + idx + '"]');
        if (percentNode) percentNode.textContent = percentText;
        if (fillNode) fillNode.style.width = rowPercent.toFixed(2) + '%';
      });
      var totalLabelNode = text.querySelector('[data-sb-total-label]');
      var totalFillNode = text.querySelector('[data-sb-total-fill]');
      var totalPercentNode = text.querySelector('[data-sb-total-percent]');
      var comfortNode = text.querySelector('[data-sb-comfort]');
      if (totalLabelNode && !totalPercentNode) {
        totalLabelNode.innerHTML = '<span>Tổng tiến trình</span><b data-sb-total-percent>' + totalPercent + '%</b>';
        totalPercentNode = text.querySelector('[data-sb-total-percent]');
      }
      if (totalPercentNode) totalPercentNode.textContent = totalPercent + '%';
      if (totalFillNode) totalFillNode.style.width = totalRawPercent.toFixed(2) + '%';
      if (comfortNode) comfortNode.textContent = sbComfortMessage(comfortPercent);
    }

    function sbSetSubmitSteps(labels, activeIndex, doneCount, isError, currentPercent) {
      labels = labels || [];
      activeIndex = Math.max(0, Math.min(labels.length - 1, Number(activeIndex || 0)));
      doneCount = Math.max(0, Math.min(labels.length, Number(doneCount || 0)));
      currentPercent = Math.max(0, Math.min(100, Number(currentPercent || 0)));
      var states = labels.map(function (_, idx) {
        return idx < doneCount ? 'done' : (idx === activeIndex ? 'active' : 'pending');
      });
      var percents = labels.map(function (_, idx) {
        if (idx < doneCount) return 100;
        if (idx === activeIndex) return currentPercent;
        return 0;
      });
      sbSetSubmitStepStates(labels, states, percents, isError, currentPercent);
    }

    function sbStartCurrentUploadProgress(labels, activeIndex, doneCount) {
      sbStopCurrentUploadProgress();
      sbCurrentUploadProgress = 3.5;
      sbComfortIndex = 0;
      sbSetSubmitSteps(labels, activeIndex, doneCount, false, sbCurrentUploadProgress);
      sbCurrentUploadTimer = window.setInterval(function () {
        var previousProgress = sbCurrentUploadProgress;
        var gap = Math.max(0, 96 - sbCurrentUploadProgress);
        var step = Math.max(0.08, Math.min(0.5, gap * 0.01));
        sbCurrentUploadProgress = Math.min(94, sbCurrentUploadProgress + step);
        if (Math.floor(previousProgress / 14) !== Math.floor(sbCurrentUploadProgress / 14)) sbComfortIndex += 1;
        sbSetSubmitSteps(labels, activeIndex, doneCount, false, sbCurrentUploadProgress);
      }, 140);
    }

    function sbCompleteCurrentUploadProgress(labels, activeIndex, doneCount) {
      sbStopCurrentUploadProgress();
      return new Promise(function (resolve) {
        function tick() {
          var gap = 100 - sbCurrentUploadProgress;
          if (gap <= .2) {
            sbCurrentUploadProgress = 100;
            sbSetSubmitSteps(labels, activeIndex, doneCount, false, sbCurrentUploadProgress);
            window.setTimeout(resolve, 180);
            return;
          }
          sbCurrentUploadProgress = Math.min(100, sbCurrentUploadProgress + Math.max(.45, gap * .12));
          sbSetSubmitSteps(labels, activeIndex, doneCount, false, sbCurrentUploadProgress);
          window.setTimeout(tick, 70);
        }
        tick();
      });
    }

    function sbStartParallelUploadProgress(labels, states, percents, index) {
      if (sbParallelUploadTimers[index]) window.clearInterval(sbParallelUploadTimers[index]);
      states[index] = 'active';
      percents[index] = Math.max(3.5, Number(percents[index] || 0));
      sbSetSubmitStepStates(labels, states, percents, false, percents[index]);
      sbParallelUploadTimers[index] = window.setInterval(function () {
        var gap = Math.max(0, 96 - Number(percents[index] || 0));
        var step = Math.max(0.08, Math.min(0.45, gap * 0.01));
        percents[index] = Math.min(94, Number(percents[index] || 0) + step);
        sbSetSubmitStepStates(labels, states, percents, false, percents[index]);
      }, 180);
    }

    function sbCompleteParallelUploadProgress(labels, states, percents, index) {
      if (sbParallelUploadTimers[index]) window.clearInterval(sbParallelUploadTimers[index]);
      delete sbParallelUploadTimers[index];
      return new Promise(function (resolve) {
        function tick() {
          var gap = 100 - Number(percents[index] || 0);
          if (gap <= .2) {
            percents[index] = 100;
            states[index] = 'done';
            sbSetSubmitStepStates(labels, states, percents, false, 100);
            window.setTimeout(resolve, 160);
            return;
          }
          percents[index] = Math.min(100, Number(percents[index] || 0) + Math.max(.45, gap * .12));
          sbSetSubmitStepStates(labels, states, percents, false, percents[index]);
          window.setTimeout(tick, 70);
        }
        tick();
      });
    }

    function sbRunLimited(items, limit, worker) {
      limit = Math.max(1, Number(limit || 1));
      var nextIndex = 0;
      var running = 0;
      var results = [];
      return new Promise(function (resolve, reject) {
        function pump() {
          if (nextIndex >= items.length && running <= 0) {
            resolve(results);
            return;
          }
          while (running < limit && nextIndex < items.length) {
            (function (item, index) {
              nextIndex += 1;
              running += 1;
              Promise.resolve(worker(item, index)).then(function (result) {
                results[index] = result;
                running -= 1;
                pump();
              }).catch(reject);
            })(items[nextIndex], nextIndex);
          }
        }
        pump();
      });
    }

    function sbRunStaggered(items, worker, delayMsFn) {
      items = items || [];
      var nextIndex = 0;
      var jobs = [];
      var firstError = null;
      function startNext() {
        if (nextIndex >= items.length) return Promise.resolve();
        var itemIndex = nextIndex;
        nextIndex += 1;
        var job = Promise.resolve()
          .then(function () { return worker(items[itemIndex], itemIndex); })
          .catch(function (err) {
            if (!firstError) firstError = err;
          });
        jobs.push(job);
        if (nextIndex >= items.length) return Promise.resolve();
        return Promise.race([
          job,
          sbDelay(Math.max(0, Number(delayMsFn ? delayMsFn() : 0)))
        ]).then(startNext);
      }
      return startNext().then(function () {
        return Promise.all(jobs);
      }).then(function () {
        if (firstError) throw firstError;
      });
    }

    function sbRunStaggeredStarts(items, delayMsFn, worker) {
      items = items || [];
      var nextIndex = 0;
      var jobs = [];
      var results = [];
      var firstError = null;
      return new Promise(function (resolve, reject) {
        function finishWhenStarted() {
          Promise.all(jobs).then(function () {
            if (firstError) reject(firstError);
            else resolve(results);
          }).catch(reject);
        }

        function startNext() {
          if (nextIndex >= items.length) {
            finishWhenStarted();
            return;
          }
          var itemIndex = nextIndex;
          nextIndex += 1;
          var job = Promise.resolve()
            .then(function () { return worker(items[itemIndex], itemIndex); })
            .then(function (result) {
              results[itemIndex] = result;
            })
            .catch(function (err) {
              if (!firstError) firstError = err;
            });
          jobs.push(job);
          if (nextIndex >= items.length) {
            finishWhenStarted();
            return;
          }
          sbDelay(Math.max(0, Number(delayMsFn ? delayMsFn() : 0))).then(startNext);
        }

        startNext();
      });
    }

    function sbRunSequentiallySpaced(items, worker) {
      items = items || [];
      var results = [];
      var chain = Promise.resolve();
      items.forEach(function (item, index) {
        chain = chain.then(function () {
          return Promise.resolve(worker(item, index)).then(function (result) {
            results[index] = result;
            return result;
          });
        });
      });
      return chain.then(function () { return results; });
    }

    function sbSetSubmitSuccess() {
      sbStopSoftProgress();
      sbStopCurrentUploadProgress();
      var wrap = $('sbSubmitProgressWrap');
      var bar = $('sbSubmitProgressBar');
      var text = $('sbSubmitProgressText');
      if (wrap) wrap.style.display = 'block';
      if (bar) {
        if (bar.parentNode) bar.parentNode.style.display = '';
        bar.style.width = '0%';
        bar.style.background = '';
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            bar.style.width = '100%';
          });
        });
      }
      if (text) {
        text.style.color = '#536048';
        text.innerHTML = '<div class="sb-submit-success"><span class="sb-submit-success-icon">✓</span><span>Đã gửi thành công về thu ngân.</span></div>';
      }
    }

    function sbSubmitButtons() {
      return [$('sbFloatingSubmitBtn')].filter(Boolean);
    }

    function sbSetSubmitButtons(disabled, text, opacity) {
      sbSubmitButtons().forEach(function (btn) {
        btn.disabled = Boolean(disabled);
        if (text) btn.textContent = text;
        btn.style.opacity = opacity || '';
      });
    }

    function sbPageHasSelectedPhoto(pageIndex) {
      var start = sbPageSlotStart(pageIndex);
      var count = sbSlotsPerPage(pageIndex);
      for (var i = 0; i < count; i++) {
        var slot = sbSlots[start + i];
        if (slot && slot.src) return true;
      }
      return false;
    }

    function sbSelectedPageIndexes() {
      var pages = [];
      for (var pageIndex = 0; pageIndex < sbTotalPages(); pageIndex++) {
        if (sbPageHasSelectedPhoto(pageIndex)) pages.push(pageIndex);
      }
      return pages;
    }

    function sbHasPtcardSelection() {
      return sbPtcardCards.some(function (card, index) {
        return sbPtcardHasImages(card, sbPtcardPresetForCard(index));
      });
    }

    function sbHasCdSelection() {
      return sbCdCards.some(function (disc) {
        return Boolean(disc && disc.slot && disc.slot.src);
      });
    }

    function sbHasAnySubmitContent() {
      return sbSlots.some(function (item) { return item && item.src; }) || sbHasPtcardSelection() || sbHasCdSelection();
    }

    function sbCardPreviewKey() {
      var selectedPages = sbSelectedPageIndexes();
      return JSON.stringify({
        cardRenderVersion: SB_CARD_RENDER_VERSION,
        cardJpegQuality: SB_CARD_JPEG_QUALITY,
        preset: sbFramePresetId,
        pagePresets: sbPagePresetIds.slice(0, sbTotalPages()),
        pages: sbTotalPages(),
        selectedPages: selectedPages,
        cardRegions: selectedPages.map(function (pageIndex) {
          var presetId = sbPagePresetIds[pageIndex] || sbFramePresetId;
          return {
            page: pageIndex,
            preset: presetId,
            regions: (sbPreset(pageIndex).cardRegions || []).map(function (region) {
              return {
                x: Number(region.x || 0),
                y: Number(region.y || 0),
                w: Number(region.w || region.width || 0),
                h: Number(region.h || region.height || 0),
                rotate: Number(region.rotate || 0),
                label: String(region.label || region.name || '')
              };
            })
          };
        }),
        slots: sbSlots.map(function (slot) {
          if (!slot) return null;
          return {
            source: slot.source || '',
            id: slot.id || '',
            name: slot.name || '',
            src: slot.src || '',
            size: slot.size || 0,
            zoom: Number(slot.zoom || 1),
            offsetX: Number(slot.offsetX || 0),
            offsetY: Number(slot.offsetY || 0),
            rotate: Number(slot.rotate || 0),
            flipX: Boolean(slot.flipX)
          };
        })
      });
    }

    function sbSubmittedCardRegionsPayload(pages) {
      var selectedPages = Array.isArray(pages) && pages.length ? pages.slice() : sbSelectedPageIndexes();
      return selectedPages.map(function (pageIndex) {
        var presetId = sbPagePresetIds[pageIndex] || sbFramePresetId;
        return {
          page: pageIndex,
          preset: presetId,
          regions: (sbPreset(pageIndex).cardRegions || []).map(function (region) {
            return {
              x: Number(region.x || 0),
              y: Number(region.y || 0),
              w: Number(region.w || region.width || 0),
              h: Number(region.h || region.height || 0),
              rotate: Number(region.rotate || 0),
              label: String(region.label || region.name || '')
            };
          })
        };
      });
    }

    function sbSubmitSignature(socialConsent) {
      return sbCardPreviewKey() + '|' + JSON.stringify({
        socialConsent: socialConsent || {},
        ptcards: sbPtcardCards.map(function (card, index) {
          return {
            preset: (sbPtcardPresetForCard(index) || {}).id || card && card.presetId || '',
            front: card && card.frontSlots || [],
            back: card && card.backSlots || []
          };
        }),
        cds: sbCdCards.map(function (disc, index) {
          var slot = disc && disc.slot;
          return {
            preset: (sbCdPresetForDisc(index) || {}).id || disc && disc.presetId || '',
            src: slot && (slot.uploadRef || slot.id || slot.name || slot.src) || '',
            zoom: slot && Number(slot.zoom || 1),
            offsetX: slot && Number(slot.offsetX || 0),
            offsetY: slot && Number(slot.offsetY || 0),
            rotate: slot && Number(slot.rotate || 0),
            flipX: slot && Boolean(slot.flipX)
          };
        }),
        extras: {
          cds: (sbExtraUploads.cds || []).map(function (item) { return item && (item.uploadRef || item.name || item.src); })
        }
      });
    }

    function sbHasFreshCardPreview() {
      return Boolean(sbCardPreviewCards.length && sbCardPreviewSignature === sbCardPreviewKey());
    }

    function sbScheduleCardPreview(delayMs) {
      if (sbAutoPreviewTimer) window.clearTimeout(sbAutoPreviewTimer);
      if (!sbSlots.some(function (item) { return item && item.src; })) return;
      sbAutoPreviewTimer = window.setTimeout(function () {
        sbAutoPreviewTimer = null;
        if (!sbSlots.some(function (item) { return item && item.src; }) || sbHasFreshCardPreview()) return;
        sbBuildCardPreview({ auto: true }).catch(function () {});
      }, typeof delayMs === 'number' ? delayMs : 650);
    }

    function sbSetCardPreviewStatus(message, isError, isLoading) {
      var status = $('sbCardPreviewStatus');
      if (!status) return;
      status.style.color = isError ? '#B4534F' : '#766E60';
      status.innerHTML = (message || '') + (isLoading ? ' <span class="sb-loading-dots"></span>' : '');
    }

    function sbPresetCardRegions(pageIndex) {
      var preset = sbPreset(typeof pageIndex === 'number' ? pageIndex : sbPage);
      var regions = Array.isArray(preset && preset.cardRegions) ? preset.cardRegions : [];
      return regions.map(function (region) {
        return {
          x: Math.max(0, Number(region.x || 0)),
          y: Math.max(0, Number(region.y || 0)),
          w: Math.max(1, Number(region.w || region.width || 1)),
          h: Math.max(1, Number(region.h || region.height || 1)),
          rotate: Number(region.rotate || 0),
          label: String(region.label || region.name || '').trim()
        };
      }).filter(function (region) { return region.w > 1 && region.h > 1; });
    }

    function sbCropCardPreviewTiles(cards) {
      var hasRegions = cards.some(function (card) { return sbPresetCardRegions(card.page).length > 0; });
      if (!hasRegions) return Promise.resolve(cards);
      sbClearCardPreviewObjectUrls();
      var jobs = [];
      cards.forEach(function (card) {
        var regions = sbPresetCardRegions(card.page);
        regions.forEach(function (region, regionIndex) {
          jobs.push(loadImageForCanvas(card.dataUrl).then(function (img) {
            var label = sbCardRegionLabel(region, regionIndex);
            var stem = sbSafeCardLabelStem(label, 'card_' + String(regionIndex + 1).padStart(2, '0'));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(region.w));
            canvas.height = Math.max(1, Math.round(region.h));
            var ctx = canvas.getContext('2d');
            ctx.drawImage(
              img,
              Math.max(0, Math.round(region.x)),
              Math.max(0, Math.round(region.y)),
              canvas.width,
              canvas.height,
              0,
              0,
              canvas.width,
              canvas.height
            );
            return sbCanvasToObjectUrl(canvas, 'image/jpeg', .78).then(function (previewUrl) {
              return {
                page: card.page,
                region: regionIndex,
                label: label,
                name: 'selfbooth_preview_' + String((card.page || 0) + 1).padStart(2, '0') + '_' + stem + '.jpg',
                previewUrl: previewUrl
              };
            });
          }));
        });
      });
      return Promise.all(jobs).then(function (tiles) {
        return tiles.filter(function (tile) { return tile && (tile.previewUrl || tile.dataUrl); });
      }).catch(function () {
        return cards;
      });
    }

    function sbCropCardPreviewDataUrls(cards) {
      var hasRegions = cards.some(function (card) { return sbPresetCardRegions(card.page).length > 0; });
      if (!hasRegions) return Promise.resolve([]);
      var jobs = [];
      cards.forEach(function (card) {
        var regions = sbPresetCardRegions(card.page);
        regions.forEach(function (region, regionIndex) {
          jobs.push(loadImageForCanvas(card.dataUrl).then(function (img) {
            var label = sbCardRegionLabel(region, regionIndex);
            var stem = sbSafeCardLabelStem(label, 'card_' + String(regionIndex + 1).padStart(2, '0'));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(region.w));
            canvas.height = Math.max(1, Math.round(region.h));
            var ctx = canvas.getContext('2d');
            sbSetCanvasQuality(ctx);
            ctx.drawImage(
              img,
              Math.max(0, Math.round(region.x)),
              Math.max(0, Math.round(region.y)),
              canvas.width,
              canvas.height,
              0,
              0,
              canvas.width,
              canvas.height
            );
            return {
              page: card.page,
              region: regionIndex,
              label: label,
              name: 'selfbooth_preview_' + String((card.page || 0) + 1).padStart(2, '0') + '_' + stem + '.jpg',
              w: canvas.width,
              h: canvas.height,
              dataUrl: canvas.toDataURL('image/jpeg', .94)
            };
          }));
        });
      });
      return Promise.all(jobs).then(function (tiles) {
        return tiles.filter(function (tile) { return tile && tile.dataUrl; });
      }).catch(function () {
        return [];
      });
    }

    function sbRenderFramePreviewGrid(cards) {
      var grid = $('sbFramePreviewGrid');
      if (!grid) return;
      if (!cards || !cards.length) {
        grid.style.display = 'none';
        grid.innerHTML = '';
        return;
      }
      grid.style.display = 'grid';
      grid.innerHTML = cards.map(function (card, index) {
        var src = card.previewUrl || card.dataUrl || '';
        if (!src) return '';
        var name = card.name || ('selfbooth_card_' + String(index + 1).padStart(2, '0') + '.jpg');
        return '<a href="' + escAttr(src) + '" data-fancybox="sb-frame-preview" data-caption="' + escAttr(name) + '"><img src="' + escAttr(src) + '" alt="Frame SelfBooth ' + (index + 1) + '"></a>';
      }).join('');
      sbInitFancybox();
    }

    function sbRenderCardPreviewGrid(cards) {
      var grid = $('sbCardPreviewGrid');
      if (!grid) return;
      if (!cards || !cards.length) {
        grid.style.display = 'none';
        grid.innerHTML = '';
        return;
      }
      grid.style.display = 'flex';
      grid.innerHTML = cards.map(function (card, index) {
        var label = card.label || card.name || ('Card ' + (index + 1));
        return '<div class="sb-card-preview-item"><img src="' + escAttr(card.previewUrl || card.dataUrl) + '" alt="' + escAttr(label) + '" class="no-fancybox"><span>' + esc(label) + '</span></div>';
      }).join('');
    }

    function sbInvalidateCardPreview(options) {
      options = options || {};
      if (!options.keepPreview) sbClearCardPreviewObjectUrls();
      sbCardPreviewCards = [];
      sbCardPreviewSignature = '';
      sbSubmitJobId = '';
      sbSubmitJobSignature = '';
      if (!options.keepPreview) sbRenderCardPreviewGrid([]);
      if (!options.keepPreview) sbRenderFramePreviewGrid([]);
      sbSetCardPreviewStatus('Cần xem lại card sau khi đổi ảnh hoặc chỉnh zoom.', false, false);
      var btn = $('sbPreviewCardsBtn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Cập nhật xem lại';
      }
      sbSubmitButtons().forEach(function (submitBtn) {
        if (!submitBtn.disabled) submitBtn.textContent = 'Gửi về thu ngân';
      });
    }

    function sbBuildCardPreview(options) {
      options = options || {};
      if (sbHasFreshCardPreview()) {
        sbRenderFramePreviewGrid(sbCardPreviewCards);
        return sbCropCardPreviewTiles(sbCardPreviewCards).then(function (previewCards) {
          sbRenderCardPreviewGrid(previewCards);
          return sbCardPreviewCards;
        });
      }
      if (sbCardPreviewBuildPromise) return sbCardPreviewBuildPromise;
      var selectedPages = sbSelectedPageIndexes();
      if (!selectedPages.length) {
        sbSetCardPreviewStatus('Hãy chọn ít nhất 1 ảnh vào frame trước.', true, false);
        return Promise.reject(new Error('Hãy chọn ít nhất 1 ảnh vào frame trước.'));
      }
      var btn = $('sbPreviewCardsBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Đang tạo...';
      }
      sbSetCardPreviewStatus('Đang tạo ảnh card để xem lại', false, true);
      sbCardPreviewBuildPromise = renderSbCardDataUrls({ pages: selectedPages }).then(function (cards) {
        if (!cards.length) throw new Error('Chưa tạo được ảnh card SelfBooth. Hãy thử lại hoặc gửi phần PT Card/CD nếu có.');
        sbCardPreviewCards = cards;
        sbCardPreviewSignature = sbCardPreviewKey();
        sbRenderFramePreviewGrid(cards);
        return sbCropCardPreviewTiles(cards).then(function (previewCards) {
          sbRenderCardPreviewGrid(previewCards);
          sbResetSubmitProgress();
          var regionCount = 0;
          selectedPages.forEach(function (pageIndex) { regionCount += sbPresetCardRegions(pageIndex).length; });
          var previewText = ' Đang hiển thị ' + cards.length + ' frame bộ ảnh SB to' + (regionCount ? (' và ' + previewCards.length + ' preview card nhỏ.') : '.');
          sbSetCardPreviewStatus('Đã tạo ' + cards.length + '/' + selectedPages.length + ' ảnh A4 có ảnh để in.' + previewText + ' Kiểm tra xong rồi bấm gửi về thu ngân.', false, false);
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Tạo lại card';
          }
          sbSetSubmitButtons(false, 'Gửi về thu ngân');
          return cards;
        });
      }).catch(function (err) {
        sbSetCardPreviewStatus((err && err.message) || 'Chưa tạo được ảnh card, hãy thử lại.', true, false);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Thử lại';
        }
        throw err;
      }).finally(function () {
        sbCardPreviewBuildPromise = null;
      });
      return sbCardPreviewBuildPromise;
    }

    window.sbPreviewCards = function () {
      if (!sbRequireEditOpen()) return;
      sbSetTab('frame');
      sbRenderSlots();
      sbBuildCardPreview().catch(function () {});
    };

    function sbSocialConsentPayload(choice) {
      return {
        mode: 'selfbooth',
        consent: choice === 'yes' ? 'yes' : 'later',
        code: sbKeyCode,
        customer_name: sbCustomerName,
        customer_phone: sbCustomerPhone,
        folderId: sbSessionFolderId || fid,
        sourceFolderId: sbDownloadFolderId || fid,
        framePreset: sbFramePresetId,
        framePresets: sbPagePresetIds.slice(0, sbTotalPages()),
        pageUrl: window.location.href,
        createdAt: new Date().toISOString(),
        photoCount: sbImages.length,
        selectedSlotCount: sbSlots.filter(function (item) { return item && item.src; }).length,
        selectedPageCount: sbSelectedPageIndexes().length
      };
    }

    function sbCloseConsentModal() {
      if (sbConsentTimer) window.clearInterval(sbConsentTimer);
      sbConsentTimer = null;
      var modal = $('sbConsentModal');
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }

    function sbShowSocialConsentModal() {
      sbCloseConsentModal();
      var seconds = 10;
      var modal = document.createElement('div');
      modal.id = 'sbConsentModal';
      modal.className = 'sb-consent-backdrop';
      modal.innerHTML = '<div class="sb-consent-card"><div style="width:54px;height:54px;border-radius:50%;display:grid;place-items:center;margin:0 auto;background:#DDE4D3;color:#536048;font-size:1.5rem;font-weight:900">✓</div><h3>Chia sẻ khoảnh khắc tuyệt vời?</h3><p>Bạn có đồng ý để chúng mình chia sẻ những tấm hình lung linh này lên mạng xã hội không? Chúng mình hứa sẽ làm hình ảnh của bạn thật nổi bật!</p><div class="sb-consent-actions"><button id="sbConsentLater" type="button">Để sau nhé</button><button id="sbConsentYes" class="yes" type="button">Đồng ý (' + seconds + 's)</button></div></div>';
      ($('ptb-app') || document.body).appendChild(modal);
      var yes = $('sbConsentYes');
      var later = $('sbConsentLater');
      function choose(choice) {
        sbCloseConsentModal();
        sbSubmitWithConsent(sbSocialConsentPayload(choice));
      }
      if (yes) yes.onclick = function () { choose('yes'); };
      if (later) later.onclick = function () { choose('later'); };
      sbConsentTimer = window.setInterval(function () {
        seconds -= 1;
        if (yes) yes.textContent = 'Đồng ý (' + Math.max(0, seconds) + 's)';
        if (seconds <= 0) choose('yes');
      }, 1000);
    }

    function sbCloseSlotNoticeModal(result) {
      var modal = $('sbSlotNoticeModal');
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      if (typeof window.sbSlotNoticeResolve === 'function') {
        var resolve = window.sbSlotNoticeResolve;
        window.sbSlotNoticeResolve = null;
        resolve(Boolean(result));
      }
    }

    function sbShowSlotNoticeModal(selectedCount, totalSlots, allowContinue) {
      return new Promise(function (resolve) {
        sbCloseSlotNoticeModal(false);
        window.sbSlotNoticeResolve = resolve;
        var modal = document.createElement('div');
        modal.id = 'sbSlotNoticeModal';
        modal.className = 'sb-consent-backdrop';
        var selectedPages = sbSelectedPageIndexes().length;
        var title = allowContinue ? 'Bạn chưa chọn đủ ảnh' : 'Chưa có ảnh trong frame';
        var message = allowContinue
          ? ('Bạn mới chọn ' + selectedCount + '/' + totalSlots + ' slot trên ' + selectedPages + '/' + sbTotalPages() + ' tờ. Hệ thống chỉ gửi các tờ đã có ảnh; các tờ trống có thể gửi sau.')
          : 'Hãy bấm dấu + trên slot trống để chọn ít nhất một ảnh trước khi gửi về thu ngân.';
        var actions = allowContinue
          ? '<div class="sb-consent-actions"><button id="sbSlotNoticeMore" class="danger-soft" type="button">Chọn thêm ảnh</button><button id="sbSlotNoticeContinue" class="yes" type="button">Gửi với ảnh hiện có</button></div>'
          : '<div class="sb-consent-actions" style="grid-template-columns:1fr"><button id="sbSlotNoticeMore" class="yes" type="button">Chọn ảnh ngay</button></div>';
        modal.innerHTML = '<div class="sb-consent-card" role="dialog" aria-modal="true" aria-label="' + escAttr(title) + '"><div class="sb-slot-notice-icon">+</div><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p>' + actions + '</div>';
        ($('ptb-app') || document.body).appendChild(modal);
        var more = $('sbSlotNoticeMore');
        var cont = $('sbSlotNoticeContinue');
        modal.onclick = function (event) {
          if (event.target === modal) sbCloseSlotNoticeModal(false);
        };
        if (more) more.onclick = function () {
          sbCloseSlotNoticeModal(false);
        };
        if (cont) cont.onclick = function () {
          sbCloseSlotNoticeModal(true);
        };
      });
    }

    function sbSubmitWithConsent(socialConsent) {
      if (!sbRequireEditOpen()) return;
      sbSetTab('frame');
      sbResetSubmitProgress();
      sbSetSubmitButtons(true, 'Đang tải...', '.72');
      var selectedPages = sbSelectedPageIndexes();
      var hasMainCards = selectedPages.length > 0;
      if (!sbHasAnySubmitContent()) {
        sbSetSubmitProgress(0, 'Hãy chọn ít nhất 1 ảnh ở frame chính, PT Card hoặc CD trước khi gửi.', true);
        sbSetSubmitButtons(false, 'Gửi về thu ngân');
        return;
      }
      sbSetSubmitProgress(1, 'Đang chuẩn bị ảnh kết quả để gửi về thu ngân...');
      sbScrollSubmitProgressIntoView(true);
      var cardsPromise = !hasMainCards
        ? Promise.resolve([])
        : (sbHasFreshCardPreview()
        ? Promise.resolve(sbCardPreviewCards.filter(function (card) {
          return selectedPages.indexOf(Number(card && card.page || 0)) >= 0;
        }))
        : renderSbCardDataUrls({ pages: selectedPages }).then(function (cards) {
          sbCardPreviewCards = cards;
          sbCardPreviewSignature = sbCardPreviewKey();
          return cards;
        }));
      Promise.all([cardsPromise, renderSbPtcardDataUrls({ allowMissing: false }), renderSbCdDataUrls({ allowMissing: true })]).then(function (results) {
        var cards = results[0] || [];
        var ptcards = results[1] || [];
        var cds = results[2] || [];
        var frameOutputs = ptcards.concat(cds);
        sbSetSubmitButtons(true, 'Đang tải...', '.72');
        if (!cards.length && !frameOutputs.length) throw new Error('Chưa có ảnh nào để gửi. Hãy chọn ảnh ở frame chính, PT Card hoặc CD.');
        var uploadItems = [];
        var uploadRefs = {};
        var slots = sbSlots.map(function (slot, idx) {
          if (!slot) return null;
          if (slot.source === 'upload') {
            var uploadRef = sbSlotUploadRef(slot, idx);
            if (!uploadRefs[uploadRef]) {
              uploadRefs[uploadRef] = true;
              uploadItems.push({ slot: slot, slotIndex: idx, uploadRef: uploadRef });
            }
            return { slot: idx, source: 'upload', uploadRef: uploadRef, name: slot.name || '', size: slot.size || 0, zoom: slot.zoom || 1, offsetX: slot.offsetX || 0, offsetY: slot.offsetY || 0, rotate: Number(slot.rotate || 0), flipX: Boolean(slot.flipX) };
          }
          return { slot: idx, source: 'drive', id: slot.id || '', name: slot.name || '', zoom: slot.zoom || 1, offsetX: slot.offsetX || 0, offsetY: slot.offsetY || 0, rotate: Number(slot.rotate || 0), flipX: Boolean(slot.flipX) };
        });
        ['photocards', 'cds'].forEach(function (kind) {
          (sbExtraUploads[kind] || []).forEach(function (slot, extraIndex) {
            if (!slot || slot.source !== 'upload') return;
            var uploadRef = slot.uploadRef || ('extra|' + kind + '|' + extraIndex);
            if (uploadRefs[uploadRef]) return;
            uploadRefs[uploadRef] = true;
            uploadItems.push({ slot: slot, slotIndex: kind + '_' + extraIndex, uploadRef: uploadRef, role: kind });
          });
        });
        if (!slots.some(Boolean) && !frameOutputs.length) throw new Error('Hãy chọn ít nhất 1 ảnh ở frame chính, PT Card hoặc CD.');
        return Promise.all(uploadItems.map(function (item) {
          return sbEnsureUploadDataUrl(item.slot).then(function (dataUrl) {
            return {
              slot: item.slotIndex,
              uploadRef: item.uploadRef,
              role: item.role || '',
              name: item.slot.name || ('slot_' + (item.slotIndex + 1) + '.jpg'),
              mimeType: item.slot.type || '',
              size: item.slot.size || sbDataUrlSize(dataUrl),
              dataUrl: dataUrl
            };
          });
        })).then(function (files) {
        files = files.filter(function (file) { return file && file.dataUrl; });
        var uploadRefRemap = {};
        var filesByContent = {};
        files = files.filter(function (file) {
          var contentKey = sbDataUrlDedupeKey(file.dataUrl);
          var canonicalRef = filesByContent[contentKey];
          if (canonicalRef) {
            uploadRefRemap[file.uploadRef] = canonicalRef;
            return false;
          }
          canonicalRef = file.uploadRef || contentKey;
          filesByContent[contentKey] = canonicalRef;
          uploadRefRemap[file.uploadRef] = canonicalRef;
          file.uploadRef = canonicalRef;
          file.contentKey = contentKey;
          return true;
        });
        slots = slots.map(function (slot) {
          if (!slot || slot.source !== 'upload') return slot;
          var mappedRef = uploadRefRemap[slot.uploadRef];
          if (!mappedRef || mappedRef === slot.uploadRef) return slot;
          return { slot: slot.slot, source: slot.source, uploadRef: mappedRef, name: slot.name || '', size: slot.size || 0, zoom: slot.zoom || 1, offsetX: slot.offsetX || 0, offsetY: slot.offsetY || 0, rotate: Number(slot.rotate || 0), flipX: Boolean(slot.flipX) };
        });
        var submitSignature = sbSubmitSignature(socialConsent);
        if (!sbSubmitJobId || sbSubmitJobSignature !== submitSignature) {
          sbSubmitJobId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          sbSubmitJobSignature = submitSignature;
        }
        var jobId = sbSubmitJobId;
        var createdAt = new Date().toISOString();
        var cardChunks = cards.map(function (card, cardIndex) {
          return {
            action: 'submitSelfBooth',
            folderId: sbSessionFolderId || fid,
            jobId: jobId,
            chunkIndex: cardIndex,
            chunkRole: 'card',
            cardPage: Number(card && card.page || 0),
            framePreset: sbFramePresetId,
            framePresets: sbPagePresetIds.slice(0, sbTotalPages()),
            submittedPages: selectedPages,
            cardRegions: sbSubmittedCardRegionsPayload(selectedPages),
            cardRenderVersion: SB_CARD_RENDER_VERSION,
            cardJpegQuality: SB_CARD_JPEG_QUALITY,
            socialConsent: socialConsent,
            expectedCardCount: cards.length,
            pageUrl: window.location.href,
            createdAt: createdAt,
            slots: slots,
            files: [],
            cards: [card],
            cardDataUrl: card ? card.dataUrl : '',
            isFinal: false
          };
        });
        var ptcardChunks = frameOutputs.map(function (ptcard, index) {
          return {
            action: 'submitSelfBooth',
            folderId: sbSessionFolderId || fid,
            jobId: jobId,
            chunkIndex: cardChunks.length + index,
            chunkRole: 'ptcard',
            framePreset: sbFramePresetId,
            framePresets: sbPagePresetIds.slice(0, sbTotalPages()),
            ptcardFrames: sbPtcardCards.map(function (cardItem, cardIndex) {
              var preset = sbPtcardPresetForCard(cardIndex);
              return preset ? preset.id : (cardItem && cardItem.presetId) || '';
            }),
            cdFrames: sbCdCards.map(function (discItem, discIndex) {
              var preset = sbCdPresetForDisc(discIndex);
              return preset ? preset.id : (discItem && discItem.presetId) || '';
            }),
            ptcardSlots: sbPtcardCards.map(function (cardItem, cardIndex) {
              var slot = cardItem && cardItem.frontSlots[0];
              function info(item) { return item ? { source: item.source || '', id: item.id || '', name: item.name || '', zoom: item.zoom || 1, offsetX: item.offsetX || 0, offsetY: item.offsetY || 0, rotate: Number(item.rotate || 0), flipX: Boolean(item.flipX) } : null; }
              return slot ? Object.assign({ card: cardIndex, frontSlots: cardItem.frontSlots.map(info), backSlots: cardItem.backSlots.map(info) }, info(slot)) : null;
            }),
            cdSlots: sbCdCards.map(function (discItem, discIndex) {
              var slot = discItem && discItem.slot;
              return slot ? { disc: discIndex, source: slot.source || '', id: slot.id || '', name: slot.name || '', zoom: slot.zoom || 1, offsetX: slot.offsetX || 0, offsetY: slot.offsetY || 0, rotate: Number(slot.rotate || 0), flipX: Boolean(slot.flipX) } : null;
            }),
            submittedPages: selectedPages,
            socialConsent: socialConsent,
            pageUrl: window.location.href,
            createdAt: createdAt,
            slots: slots,
            ptcards: [ptcard],
            isFinal: false
          };
        });
        var uploadChunks = files.map(function (file, index) {
          return {
            action: 'submitSelfBooth',
            folderId: sbSessionFolderId || fid,
            jobId: jobId,
            chunkIndex: cardChunks.length + ptcardChunks.length + index,
            chunkRole: file.role ? 'extra_upload' : 'slot_upload',
            framePreset: sbFramePresetId,
            framePresets: sbPagePresetIds.slice(0, sbTotalPages()),
            submittedPages: selectedPages,
            cardRegions: sbSubmittedCardRegionsPayload(selectedPages),
            socialConsent: socialConsent,
            pageUrl: window.location.href,
            createdAt: createdAt,
            slots: slots,
            files: [file],
            isFinal: false
          };
        });
        var chunks = cardChunks.concat(ptcardChunks, uploadChunks);
        if (chunks.length) chunks[chunks.length - 1].isFinal = true;
        chunks.forEach(function (payload, chunkIndex) {
          payload.chunkIndex = chunkIndex;
          payload.expectedUploadCount = files.length;
          payload.expectedSlotCount = slots.filter(Boolean).length;
          payload.expectedChunkCount = chunks.length;
          payload.expectedCardCount = cards.length;
          payload.expectedPtcardCount = frameOutputs.length;
          payload.expectedPhotocardCount = ptcards.length;
          payload.expectedCdCount = cds.length;
          payload.hasExpectedCard = true;
        });
        var stepLabels = chunks.map(function (payload, index) {
          var file = payload.files && payload.files[0];
          if (file && file.role) {
            var roleIndex = String(file.slot || '').split('_')[1];
            return sbExtraLabel(file.role) + (roleIndex ? (' ' + (Number(roleIndex) + 1)) : '');
          }
          if (file) return 'ảnh ' + (Number(file.slot || 0) + 1);
          if (payload.chunkRole === 'ptcard') {
            var ptcard = payload.ptcards && payload.ptcards[0];
            if (ptcard && String(ptcard.kind || ptcard.type || '').toLowerCase() === 'cd') return 'CD ' + (Number(ptcard.disc || ptcard.card || 0) + 1) + ' mặt đĩa';
            return 'PT Card ' + (Number(ptcard && ptcard.card || 0) + 1) + ' ' + (ptcard && ptcard.side === 'back' ? 'mặt 2' : 'mặt 1');
          }
          return 'ảnh card ' + (Number(payload.cardPage || 0) + 1);
        });
        var uploadStates = stepLabels.map(function () { return 'pending'; });
        var uploadPercents = stepLabels.map(function () { return 0; });
        var queuedChunks = chunks.map(function (payload, index) {
          return { payload: payload, progressIndex: index };
        });
        sbSetSubmitStepStates(stepLabels, uploadStates, uploadPercents, false, 0);
        sbScrollSubmitProgressIntoView(true);
        var resultQueue = queuedChunks.filter(function (item) {
          var payload = item && item.payload;
          return payload && (payload.chunkRole === 'ptcard' || payload.chunkRole === 'card' || Boolean((payload.cards && payload.cards.length) || payload.cardDataUrl));
        });
        var customQueue = queuedChunks.filter(function (item) {
          return resultQueue.indexOf(item) < 0;
        });
        function uploadQueuedSubmitChunk(item) {
          var payload = item.payload;
          var index = item.progressIndex;
          var isResultChunk = payload.chunkRole === 'ptcard' || payload.chunkRole === 'card' || Boolean((payload.cards && payload.cards.length) || payload.cardDataUrl);
          sbStartParallelUploadProgress(stepLabels, uploadStates, uploadPercents, index);
          var submitPromise = (payload.isFinal || isResultChunk) ? postSbPayloadWithRetry(payload, {
            attempts: isResultChunk ? 4 : 3,
            onAttempt: function (attempt, maxAttempts) {
              sbSetSubmitButtons(true, isResultChunk ? 'Đang tải kết quả...' : 'Đang tải ảnh bổ sung...', '.72');
            },
            onRetry: function (attempt, maxAttempts, err) {
              if (sbParallelUploadTimers[index]) window.clearInterval(sbParallelUploadTimers[index]);
              delete sbParallelUploadTimers[index];
              uploadStates[index] = 'active';
              uploadPercents[index] = 0;
              sbComfortIndex += 1;
              sbSetSubmitStepStates(stepLabels, uploadStates, uploadPercents, false, 0);
              sbStartParallelUploadProgress(stepLabels, uploadStates, uploadPercents, index);
            }
          }) : postSbPayloadStartOnly(payload);
          return submitPromise.then(function (result) {
            if (payload.isFinal && result) sbMergeSubmittedCardsFromSubmit(result, createdAt);
            return sbCompleteParallelUploadProgress(stepLabels, uploadStates, uploadPercents, index);
          }).catch(function (err) {
            uploadStates[index] = 'error';
            sbSetSubmitStepStates(stepLabels, uploadStates, uploadPercents, true, uploadPercents[index] || 0);
            throw err;
          });
        }
        function runSubmitQueue(queue) {
          if (!queue || !queue.length) return Promise.resolve([]);
          return sbRunStaggeredStarts(queue, sbRandomSubmitDelayMs, uploadQueuedSubmitChunk);
        }
        return runSubmitQueue(resultQueue).then(function () {
          if (customQueue.length) {
            sbSetSubmitButtons(true, 'Đang tải ảnh bổ sung...', '.72');
            return runSubmitQueue(customQueue);
          }
          return [];
        }).then(function () {
          sbSetSubmitSuccess();
          sbSetSubmitButtons(true, 'Đã gửi thành công', '.72');
        });
        });
      }).catch(function (err) {
        sbStopSoftProgress();
        sbStopCurrentUploadProgress();
        sbSetSubmitProgress(0, (err && err.message) || 'Gửi chưa thành công, hãy bấm gửi lại.', true);
        sbSetSubmitButtons(false, 'Gửi lại');
      }).finally(function () {
        sbSubmitButtons().forEach(function (btn) {
          if (btn.textContent === 'Đã gửi thành công') return;
          btn.disabled = false;
          if (btn.textContent !== 'Gửi lại') btn.textContent = 'Gửi về thu ngân';
          btn.style.opacity = '';
        });
      });
    }

    window.sbSubmit = function (skipSlotNotice) {
      if (!sbRequireEditOpen()) return;
      if (!sbHasAnySubmitContent()) {
        sbSetTab('frame');
        sbSetSubmitButtons(false, 'Gửi về thu ngân');
        sbShowSlotNoticeModal(0, sbTotalSlots(), false).then(function () {
          sbSetSubmitProgress(0, 'Bấm dấu + trên slot trống hoặc tải ảnh ở PT Card/CD trước khi gửi.', false);
        });
        return;
      }
      sbSetTab('frame');
      sbSetSubmitButtons(true, 'Đang kiểm tra...', '.72');
      sbSetSubmitProgress(0, 'Đang kiểm tra lượt chỉnh sửa...', false);
      checkSbSubmitQuota().then(function (quota) {
        if (!quota || quota.ok === false) {
          sbSetSubmitProgress(0, (quota && quota.error) || 'Chưa kiểm tra được lượt chỉnh sửa. Hãy thử lại.', true);
          sbSetSubmitButtons(false, 'Gửi về thu ngân');
          return;
        }
        if (quota.allowed === false) {
          sbShowSubmitBlocked(quota.error || 'Bạn đã hết lượt chỉnh sửa. Vui lòng liên hệ thu ngân nếu cần cập nhật thêm.');
          return;
        }
        sbResetSubmitProgress();
        sbSetSubmitButtons(false, 'Gửi về thu ngân');
        sbShowSocialConsentModal();
      }).catch(function () {
        sbSetSubmitProgress(0, 'Chưa kiểm tra được lượt chỉnh sửa. Hãy thử lại.', true);
        sbSetSubmitButtons(false, 'Gửi về thu ngân');
      });
    };
    function sbZipStatus(message, isError, linkUrl) {
      var status = $('sbZipStatus');
      if (!status) return;
      status.style.color = isError ? '#B4534F' : '#766E60';
      status.innerHTML = message || '';
    }

    function sbLoadZipData(zipUrl) {
      return fetch(zipUrl, { redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) { return JSON.parse(t); })
        .catch(function () {
          return new Promise(function (resolve, reject) {
            var cb = 'sbZipCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            var script = document.createElement('script');
            var timer = setTimeout(function () {
              cleanup();
              reject(new Error('Tạo ZIP quá lâu. Hãy bấm Mở Drive để tải trực tiếp.'));
            }, 60000);
            function cleanup() {
              clearTimeout(timer);
              try { delete window[cb]; } catch (e) { window[cb] = undefined; }
              if (script.parentNode) script.parentNode.removeChild(script);
            }
            window[cb] = function (data) {
              cleanup();
              resolve(data);
            };
            script.onerror = function () {
              cleanup();
              reject(new Error('Không kết nối được server tải ZIP.'));
            };
            script.src = zipUrl + '&callback=' + cb;
            document.body.appendChild(script);
          });
        });
    }

    window.sbZip = function (btnEl) {
      var ot = btnEl ? btnEl.textContent : '';
      var driveUrl = sbDownloadDriveUrl || ('https://drive.google.com/drive/folders/' + encodeURIComponent(sbDownloadFolderId || fid));
      if (btnEl) {
        btnEl.textContent = 'Đang mở Drive...';
        btnEl.disabled = true;
        btnEl.style.opacity = '.72';
      }
      sbZipStatus('Đang mở Google Drive. Trong Drive, chọn ảnh hoặc chọn tất cả rồi bấm Download/Tải xuống để lấy file gốc.', false, driveUrl);
      var opened = null;
      try { opened = window.open(driveUrl, '_blank', 'noopener'); } catch (err) { opened = null; }
      if (!opened) {
        sbZipStatus('Trình duyệt đang chặn tab mới. Hãy cho phép pop-up cho trang này rồi bấm lại nút tải.', true);
      }
      if (btnEl) {
        setTimeout(function () {
          if (btnEl) btnEl.textContent = ot;
          btnEl.disabled = false;
          btnEl.style.opacity = '';
        }, 1200);
      }
    };

    function esc(value) { return String(value || '').replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
    function escAttr(value) { return esc(value).replace(/\\/g, '\\\\'); }

    function readFileDataUrl(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function sbJpegName(name) {
      return String(name || 'upload.jpg').replace(/\.[^.]+$/, '') + '.jpg';
    }

    function sbDataUrlSize(dataUrl) {
      var base64 = String(dataUrl || '').split(',')[1] || '';
      return Math.max(0, Math.floor(base64.length * 3 / 4));
    }
    function sbDataUrlDedupeKey(dataUrl) {
      dataUrl = String(dataUrl || '');
      return 'data-' + sbStringHash([
        dataUrl.length,
        dataUrl.slice(0, 256),
        dataUrl.slice(-256)
      ].join('|'));
    }

    function readImageFileDataUrl(file) {
      return readFileDataUrl(file);
    }

    function sbEnsureUploadDataUrl(slot) {
      if (!slot || slot.source !== 'upload') return Promise.resolve('');
      if (slot.dataUrl) return Promise.resolve(slot.dataUrl);
      var uploadRef = slot.uploadRef || '';
      var cached = uploadRef ? sbUploadFileCache[uploadRef] : null;
      if (cached && cached.dataUrl) {
        slot.dataUrl = cached.dataUrl;
        slot.type = slot.type || cached.type || 'application/octet-stream';
        slot.size = slot.size || cached.size || sbDataUrlSize(cached.dataUrl);
        return Promise.resolve(cached.dataUrl);
      }
      if (!cached || !cached.file) {
        return Promise.reject(new Error('Ảnh tải lên chưa sẵn sàng. Hãy chọn lại ảnh nếu cần.'));
      }
      if (!cached.promise) {
        cached.promise = readImageFileDataUrl(cached.file).then(function (dataUrl) {
          cached.dataUrl = dataUrl;
          cached.size = cached.size || sbDataUrlSize(dataUrl);
          return dataUrl;
        });
      }
      return cached.promise.then(function (dataUrl) {
        slot.dataUrl = dataUrl;
        slot.type = slot.type || cached.type || 'application/octet-stream';
        slot.size = slot.size || cached.size || sbDataUrlSize(dataUrl);
        return dataUrl;
      });
    }

    function sbCanvasImageSrcForSlot(slot) {
      if (!slot || !slot.src) return Promise.resolve('');
      if (slot.source !== 'upload') return Promise.resolve(slot.src);
      return sbEnsureUploadDataUrl(slot).then(function (dataUrl) {
        return dataUrl || slot.src || '';
      });
    }

    function loadImageForCanvas(src) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = src;
      });
    }

    function sbSetCanvasQuality(ctx) {
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = 'high'; } catch (err) {}
    }

    function drawSlotImage(ctx, img, x, y, w, h, slot) {
      sbSetCanvasQuality(ctx);
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      var zoom = Math.max(1, Number((slot && slot.zoom) || 1));
      var safeSlot = {
        imgW: iw,
        imgH: ih,
        zoom: zoom,
        offsetX: Number((slot && slot.offsetX) || 0),
        offsetY: Number((slot && slot.offsetY) || 0),
        rotate: Number((slot && slot.rotate) || 0),
        flipX: Boolean(slot && slot.flipX)
      };
      sbConstrainSlot(safeSlot, { w: w, h: h });
      zoom = Math.max(1, Number(safeSlot.zoom || 1));
      var scale = Math.max(w / iw, h / ih) * zoom;
      var dw = iw * scale;
      var dh = ih * scale;
      var cx = x + w / 2 + (safeSlot.offsetX / 100) * w;
      var cy = y + h / 2 + (safeSlot.offsetY / 100) * h;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.rotate(sbNormalizeRotation(safeSlot.rotate) * Math.PI / 180);
      if (safeSlot.flipX) {
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    function renderSbCardPageDataUrl(pageIndex) {
      var preset = sbPreset(pageIndex);
      var cardW = Number(preset.width || 1200);
      var cardH = Number(preset.height || 3000);
      var canvas = document.createElement('canvas');
      canvas.width = cardW;
      canvas.height = cardH;
      var ctx = canvas.getContext('2d');
      sbSetCanvasQuality(ctx);
      ctx.fillStyle = preset.bg;
      ctx.fillRect(0, 0, cardW, cardH);

      var overlayImage = null;
      var overlayJob = Promise.resolve();
      if (preset.overlayUrl) {
        overlayJob = loadImageForCanvas(preset.overlayUrl).then(function (overlayImg) {
          overlayImage = overlayImg;
        }).catch(function () {});
      }

      return overlayJob.then(function () {
        if (!preset.overlayOnly) {
          ctx.fillStyle = preset.accent;
          ctx.font = 'bold 34px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(preset.title, cardW / 2, 58);
        }

        var pageSlots = sbPresetPageSlots(preset, pageIndex, cardW);
        var slotsPerPage = sbSlotsPerPage(pageIndex);
        var start = sbPageSlotStart(pageIndex);
        var orderedSlots = [];
        for (var i = 0; i < slotsPerPage; i++) {
          orderedSlots.push({ localSlot: i, frameSlot: pageSlots[i] || sbDefaultPageSlots(cardW)[i % SB_DEFAULT_SLOTS_PER_PAGE], slot: sbSlots[start + i] });
        }
        orderedSlots.sort(sbCompareSlotLayers);
        return Promise.all(orderedSlots.map(function (entry) {
          if (!entry.slot || !entry.slot.src) return Promise.resolve(null);
          return sbCanvasImageSrcForSlot(entry.slot).then(function (src) {
            return src ? loadImageForCanvas(src) : null;
          }).catch(function () { return null; });
        })).then(function (images) {
        orderedSlots.forEach(function (entry, index) {
          var slot = entry.slot;
          var frameSlot = entry.frameSlot;
          var x = Number(frameSlot.x || 0);
          var y = Number(frameSlot.y || 0);
          var slotW = Number(frameSlot.w || frameSlot.width || 1);
          var slotH = Number(frameSlot.h || frameSlot.height || 1);
          var rotate = Number(frameSlot.rotate || 0);
          var drawX = x;
          var drawY = y;
          ctx.fillStyle = preset.slotBg;
          ctx.save();
          if (Math.abs(rotate) > 0.01) {
            ctx.translate(x + slotW / 2, y + slotH / 2);
            ctx.rotate(rotate * Math.PI / 180);
            ctx.translate(-slotW / 2, -slotH / 2);
            drawX = 0;
            drawY = 0;
          }
          ctx.fillRect(drawX, drawY, slotW, slotH);
          ctx.strokeStyle = preset.border;
          ctx.lineWidth = 3;
          ctx.strokeRect(drawX, drawY, slotW, slotH);
          ctx.restore();
          if (images[index]) {
            ctx.save();
            if (Math.abs(rotate) > 0.01) {
              ctx.translate(x + slotW / 2, y + slotH / 2);
              ctx.rotate(rotate * Math.PI / 180);
              ctx.translate(-slotW / 2, -slotH / 2);
              x = 0; y = 0;
            }
            drawSlotImage(ctx, images[index], x, y, slotW, slotH, slot);
            ctx.restore();
          }
        });
        });
      }).then(function () {
        if (overlayImage) {
          ctx.drawImage(overlayImage, 0, 0, cardW, cardH);
        }
        if (!preset.overlayOnly) {
          ctx.fillStyle = preset.text;
          ctx.font = 'italic 76px Georgia';
          ctx.textAlign = 'center';
          ctx.fillText(preset.signature, cardW / 2, cardH - 118);
          ctx.font = 'bold 30px Arial';
          ctx.fillText(preset.footer, cardW / 2, cardH - 58);
        }
        return canvas.toDataURL('image/jpeg', SB_CARD_JPEG_QUALITY);
      }).catch(function () {
        return '';
      });
    }

    function renderSbCardDataUrls(options) {
      options = options || {};
      var pages = Array.isArray(options.pages) && options.pages.length ? options.pages.slice() : sbSelectedPageIndexes();
      var jobs = [];
      pages.forEach(function (page) {
        (function (pageIndex) {
          jobs.push(renderSbCardPageDataUrl(pageIndex).then(function (dataUrl) {
            var preset = sbPreset(pageIndex);
            return {
              page: pageIndex,
              name: 'selfbooth_card_' + String(pageIndex + 1).padStart(2, '0') + '.jpg',
              renderVersion: SB_CARD_RENDER_VERSION,
              jpegQuality: SB_CARD_JPEG_QUALITY,
              w: Number(preset && preset.width || 0),
              h: Number(preset && preset.height || 0),
              dataUrl: dataUrl
            };
          }));
        })(page);
      });
      return Promise.all(jobs).then(function (cards) {
        return cards.filter(function (card) { return card && card.dataUrl; });
      });
    }

    function sbPtcardPreviewKey() {
      return JSON.stringify(sbPtcardCards.map(function (card, index) {
        var preset = sbPtcardPresetForCard(index) || {};
        return {
          preset: preset.id || '',
          front: card.frontSlots,
          back: card.backSlots
        };
      }));
    }

    function renderSbPtcardSideDataUrl(cardIndex, side) {
      var preset = sbPtcardPresetForCard(cardIndex);
      var card = sbPtcardCards[cardIndex] || {};
      if (!preset) return Promise.resolve('');
      var cardW = Math.max(300, Number(preset.width || 2055));
      var cardH = Math.max(300, Number(preset.height || 1299));
      var canvas = document.createElement('canvas');
      canvas.width = cardW;
      canvas.height = cardH;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cardW, cardH);
      var frameUrl = side === 'back' ? preset.backUrl : preset.frontUrl;
      if (!frameUrl) return Promise.reject(new Error('Thiếu frame PT Card mặt ' + (side === 'front' ? 'trước' : 'sau')));
      var editable = side === 'front' || Number(preset.editableSides || 1) === 2;
      var states = side === 'back' ? card.backSlots : card.frontSlots;
      var entries = editable ? sbPtcardSideSlots(preset, side).map(function (frameSlot, index) {
        return { frameSlot: frameSlot, localSlot: index, slot: states[index] };
      }).sort(sbCompareSlotLayers) : [];
      return Promise.all(entries.map(function (entry) {
        if (!entry.slot || !entry.slot.src) return Promise.resolve(null);
        return sbCanvasImageSrcForSlot(entry.slot).then(loadImageForCanvas);
      }).concat([loadImageForCanvas(frameUrl)])).then(function (images) {
        entries.forEach(function (entry, index) {
        var img = images[index];
        if (!img) return;
        var frameSlot = entry.frameSlot;
        var x = Number(frameSlot.x || 0);
        var y = Number(frameSlot.y || 0);
        var slotW = Number(frameSlot.w || frameSlot.width || cardW);
        var slotH = Number(frameSlot.h || frameSlot.height || cardH);
        var rotate = Number(frameSlot.rotate || 0);
        ctx.save();
        if (Math.abs(rotate) > 0.01) {
          ctx.translate(x + slotW / 2, y + slotH / 2);
          ctx.rotate(rotate * Math.PI / 180);
          ctx.translate(-slotW / 2, -slotH / 2);
          x = 0;
          y = 0;
        }
        drawSlotImage(ctx, img, x, y, slotW, slotH, entry.slot);
        ctx.restore();
        });
        ctx.drawImage(images[entries.length], 0, 0, cardW, cardH);
        return canvas.toDataURL('image/jpeg', SB_CARD_JPEG_QUALITY);
      });
    }

    function renderSbPtcardDataUrls(options) {
      options = options || {};
      sbNormalizePtcardCards();
      if (!sbPtcardCards.length) return Promise.resolve([]);
      var missing = [];
      sbPtcardCards.forEach(function (card, index) {
        var preset = sbPtcardPresetForCard(index);
        if (!card || !preset) return;
        var selected = sbPtcardHasImages(card, preset);
        if (!selected) return;
        var front = sbPtcardSideSlots(preset, 'front');
        var back = Number(preset.editableSides || 1) === 2 ? sbPtcardSideSlots(preset, 'back') : [];
        if (front.some(function (_, i) { return !card.frontSlots[i] || !card.frontSlots[i].src; }) || back.some(function (_, i) { return !card.backSlots[i] || !card.backSlots[i].src; })) missing.push(index + 1);
      });
      if (missing.length && !options.allowMissing) {
        return Promise.reject(new Error('Hãy chọn đủ ảnh PT Card: còn thiếu card ' + missing.join(', ') + '.'));
      }
      var jobs = [];
      sbPtcardCards.forEach(function (card, index) {
        var preset = sbPtcardPresetForCard(index);
        if (!sbPtcardHasImages(card, preset)) return;
        ['front', 'back'].forEach(function (side) {
          jobs.push(renderSbPtcardSideDataUrl(index, side).then(function (dataUrl) {
            if (!dataUrl) return null;
            var suffix = side === 'front' ? 'mat_1' : 'mat_2';
            return {
              kind: 'ptcard',
              type: 'ptcard',
              card: index,
              side: side,
              preset: preset.id || '',
              name: 'selfbooth_ptcard_' + String(index + 1).padStart(2, '0') + '_' + suffix + '.jpg',
              renderVersion: SB_CARD_RENDER_VERSION,
              jpegQuality: SB_CARD_JPEG_QUALITY,
              w: Number(preset.width || 0),
              h: Number(preset.height || 0),
              dataUrl: dataUrl
            };
          }));
        });
      });
      return Promise.all(jobs).then(function (cards) {
        cards = cards.filter(function (card) { return card && card.dataUrl; });
        sbClearPtcardObjectUrls();
        sbPtcardPreviewCards = cards.map(function (card) {
          return Object.assign({}, card, { previewUrl: card.dataUrl });
        });
        sbPtcardPreviewSignature = sbPtcardPreviewKey();
        sbRenderPtcardComposer();
        return cards;
      });
    }

    function sbCdPreviewKey() {
      return JSON.stringify(sbCdCards.map(function (disc, index) {
        var preset = sbCdPresetForDisc(index) || {};
        var slot = disc && disc.slot;
        return {
          preset: preset.id || '',
          src: slot && slot.src || '',
          zoom: slot && Number(slot.zoom || 1),
          offsetX: slot && Number(slot.offsetX || 0),
          offsetY: slot && Number(slot.offsetY || 0),
          rotate: slot && Number(slot.rotate || 0),
          flipX: slot && Boolean(slot.flipX)
        };
      }));
    }

    function renderSbCdSideDataUrl(discIndex) {
      var preset = sbCdPresetForDisc(discIndex);
      var disc = sbCdCards[discIndex] || {};
      if (!preset || !disc.slot || !disc.slot.src) return Promise.resolve('');
      var cardW = Math.max(300, Number(preset.width || 1417));
      var cardH = Math.max(300, Number(preset.height || 1417));
      var canvas = document.createElement('canvas');
      canvas.width = cardW;
      canvas.height = cardH;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cardW, cardH);
      var frameSlot = sbPtcardFrameSlot(preset);
      return sbCanvasImageSrcForSlot(disc.slot).then(function (src) {
        if (!src) return null;
        return loadImageForCanvas(src);
      }).then(function (img) {
        if (!img) return '';
        var x = Number(frameSlot.x || 0);
        var y = Number(frameSlot.y || 0);
        var slotW = Number(frameSlot.w || frameSlot.width || cardW);
        var slotH = Number(frameSlot.h || frameSlot.height || cardH);
        var rotate = Number(frameSlot.rotate || 0);
        ctx.save();
        if (Math.abs(rotate) > 0.01) {
          ctx.translate(x + slotW / 2, y + slotH / 2);
          ctx.rotate(rotate * Math.PI / 180);
          ctx.translate(-slotW / 2, -slotH / 2);
          x = 0;
          y = 0;
        }
        drawSlotImage(ctx, img, x, y, slotW, slotH, disc.slot);
        ctx.restore();
        if (!preset.frontUrl) return '';
        return loadImageForCanvas(preset.frontUrl);
      }).then(function (frameImage) {
        if (!frameImage) return '';
        ctx.drawImage(frameImage, 0, 0, cardW, cardH);
        return canvas.toDataURL('image/jpeg', SB_CARD_JPEG_QUALITY);
      }).catch(function () {
        return '';
      });
    }

    function renderSbCdDataUrls(options) {
      options = options || {};
      sbNormalizeCdCards();
      if (!sbCdCards.length) return Promise.resolve([]);
      if (!sbAvailablePtcardPresets('cd').length) return Promise.resolve([]);
      var missing = [];
      sbCdCards.forEach(function (disc, index) {
        if (!disc || !disc.slot || !disc.slot.src) missing.push(index + 1);
      });
      if (missing.length && !options.allowMissing) {
        return Promise.reject(new Error('Hãy chọn đủ ảnh CD: còn thiếu CD ' + missing.join(', ') + '.'));
      }
      var jobs = [];
      sbCdCards.forEach(function (disc, index) {
        var preset = sbCdPresetForDisc(index);
        if (!disc || !disc.slot || !disc.slot.src || !preset) return;
        jobs.push(renderSbCdSideDataUrl(index).then(function (dataUrl) {
          if (!dataUrl) return null;
          return {
            kind: 'cd',
            type: 'cd',
            card: index,
            disc: index,
            side: 'front',
            preset: preset.id || '',
            name: 'selfbooth_cd_' + String(index + 1).padStart(2, '0') + '_mat_dia.jpg',
            renderVersion: SB_CARD_RENDER_VERSION,
            jpegQuality: SB_CARD_JPEG_QUALITY,
            diameterMm: 120,
            printer: 'Epson L8050',
            w: Number(preset.width || 0),
            h: Number(preset.height || 0),
            dataUrl: dataUrl
          };
        }));
      });
      return Promise.all(jobs).then(function (cards) {
        cards = cards.filter(function (card) { return card && card.dataUrl; });
        sbCdPreviewCards = cards.map(function (card) {
          return Object.assign({}, card, { previewUrl: card.dataUrl });
        });
        sbCdPreviewSignature = sbCdPreviewKey();
        sbRenderCdComposer();
        return cards;
      });
    }

    function sbJsonp(url, timeoutMs) {
      return new Promise(function (resolve, reject) {
        var cb = 'sbJsonpCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var script = document.createElement('script');
        var timer = window.setTimeout(function () {
          cleanup();
          reject(new Error('Apps Script phan hoi qua lau.'));
        }, timeoutMs || 25000);
        function cleanup() {
          window.clearTimeout(timer);
          try { delete window[cb]; } catch (e) { window[cb] = undefined; }
          if (script.parentNode) script.parentNode.removeChild(script);
        }
        window[cb] = function (data) {
          cleanup();
          resolve(data || {});
        };
        script.onerror = function () {
          cleanup();
          reject(new Error('Khong doc duoc trang thai upload tu Apps Script.'));
        };
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + encodeURIComponent(cb);
        document.body.appendChild(script);
      });
    }

    function checkSbSubmitStatus(payload) {
      var url = API
        + '?action=selfBoothSubmitStatus&mode=sb&id=' + encodeURIComponent(payload.folderId || fid)
        + '&jobId=' + encodeURIComponent(payload.jobId || '')
        + '&chunkIndex=' + encodeURIComponent(payload.chunkIndex || 0)
        + '&isFinal=' + encodeURIComponent(payload.isFinal ? '1' : '0');
      return sbJsonp(url, 25000);
    }

    function checkSbSubmitQuota() {
      var url = API
        + '?action=selfBoothSubmitQuota&mode=sb&id=' + encodeURIComponent(sbSessionFolderId || fid);
      return sbJsonp(url, 25000);
    }

    function sbShowSubmitBlocked(message) {
      sbSetTab('frame');
      sbStopSoftProgress();
      sbStopCurrentUploadProgress();
      sbSetSubmitProgress(0, message || 'Bạn đã hết lượt chỉnh sửa. Vui lòng liên hệ thu ngân nếu cần cập nhật thêm.', true);
      sbSetSubmitButtons(true, 'Hết lượt chỉnh sửa', '.72');
    }

    function postSbPayload(payload) {
      return new Promise(function (resolve, reject) {
        var requestId = 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        payload.requestId = requestId;
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = API;
        form.enctype = 'application/x-www-form-urlencoded';
        form.acceptCharset = 'UTF-8';
        var frameName = 'sbSubmitFrame_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        form.target = frameName;
        form.style.display = 'none';
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'payload';
        input.value = JSON.stringify(payload);
        var frame = document.createElement('iframe');
        frame.name = frameName;
        frame.id = frameName;
        frame.src = 'about:blank';
        frame.style.display = 'none';
        var submitted = false;
        var loadedTimer = null;
        var timeout = window.setTimeout(function () {
          cleanup();
          reject(new Error('Upload lên Drive qua Apps Script quá lâu. Hãy thử gửi lại.'));
        }, 90000);
        function cleanup() {
          window.clearTimeout(timeout);
          if (loadedTimer) window.clearTimeout(loadedTimer);
          window.removeEventListener('message', onMessage);
          if (frame.parentNode) frame.parentNode.removeChild(frame);
          if (form.parentNode) form.parentNode.removeChild(form);
        }
        function fail(message) {
          cleanup();
          reject(new Error(message || 'Không gửi được chunk upload.'));
        }
        function onMessage(event) {
          var data = event && event.data;
          if (!data || data.source !== 'diciibooth-sb-submit') return;
          var result = data.result || data;
          if (String(result.requestId || '') !== requestId) return;
          cleanup();
          if (!result.ok) {
            reject(new Error(result.error || 'Apps Script không nhận upload SelfBooth.'));
            return;
          }
          resolve(result);
        }
        window.addEventListener('message', onMessage);
        frame.onload = function () {
          if (!submitted) return;
          loadedTimer = window.setTimeout(function () {
            fail('Apps Script chưa trả xác nhận upload. Hãy cập nhật deployment Apps Script rồi thử gửi lại.');
          }, 8000);
        };
        frame.onerror = function () {
          fail('Không gửi được chunk upload.');
        };
        document.body.appendChild(frame);
        form.appendChild(input);
        document.body.appendChild(form);
        submitted = true;
        form.submit();
      });
    }

    function postSbPayloadRobust(payload) {
      return new Promise(function (resolve, reject) {
        var requestId = 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        payload.requestId = requestId;
        var settled = false;
        var pollTimer = null;
        var startedAt = Date.now();
        var noCorsSent = false;
        var timeout = window.setTimeout(function () {
          fail('Upload lên Drive qua Apps Script quá lâu. Hãy thử gửi lại.');
        }, 150000);
        function cleanup() {
          window.clearTimeout(timeout);
          if (pollTimer) window.clearTimeout(pollTimer);
        }
        function done(result) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result || {});
        }
        function fail(message) {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(message || 'Không gửi được chunk upload.'));
        }
        function buildBody() {
          var body = new URLSearchParams();
          body.append('payload', JSON.stringify(payload));
          return body;
        }
        function schedulePoll(ms) {
          if (pollTimer) window.clearTimeout(pollTimer);
          pollTimer = window.setTimeout(pollStatus, ms);
        }
        function sendNoCorsFallback() {
          if (noCorsSent || settled || !window.fetch) return;
          noCorsSent = true;
          fetch(API, {
            method: 'POST',
            mode: 'no-cors',
            credentials: 'omit',
            redirect: 'follow',
            body: buildBody()
          }).catch(function () {});
        }
        function pollStatus() {
          if (settled) return;
          checkSbSubmitStatus(payload).then(function (status) {
            if (settled) return;
            if (status && status.ok) {
              done(status);
              return;
            }
            if (status && status.error && !status.pending) {
              fail(status.error);
              return;
            }
            if (!noCorsSent && Date.now() - startedAt > 10000) {
              sendNoCorsFallback();
            }
            schedulePoll(4500);
          }).catch(function () {
            if (!noCorsSent && Date.now() - startedAt > 10000) {
              sendNoCorsFallback();
            }
            if (!settled) schedulePoll(5000);
          });
        }
        function sendFetchPost() {
          if (!window.fetch || !window.URLSearchParams) {
            postSbPayload(payload).then(done).catch(function () {
              schedulePoll(600);
            });
            return;
          }
          fetch(API, {
            method: 'POST',
            mode: 'no-cors',
            credentials: 'omit',
            redirect: 'follow',
            body: buildBody()
          }).then(function () {
            noCorsSent = true;
            schedulePoll(payload.isFinal ? 1400 : 2600);
          }).catch(function () {
            postSbPayload(payload).then(done).catch(function () {
              schedulePoll(payload.isFinal ? 1400 : 2600);
            });
          });
        }
        sendFetchPost();
        schedulePoll(payload.isFinal ? 3200 : 5000);
      });
    }

    function postSbPayloadStartOnly(payload) {
      return new Promise(function (resolve, reject) {
        payload.requestId = payload.requestId || ('sb_' + Date.now() + '_' + Math.random().toString(36).slice(2));
        function buildBody() {
          var body = new URLSearchParams();
          body.append('payload', JSON.stringify(payload));
          return body;
        }
        function accepted() {
          window.setTimeout(function () {
            resolve({
              ok: true,
              pending: true,
              jobId: payload.jobId || '',
              chunkIndex: payload.chunkIndex || 0
            });
          }, 450);
        }
        if (window.fetch && window.URLSearchParams) {
          fetch(API, {
            method: 'POST',
            mode: 'no-cors',
            credentials: 'omit',
            redirect: 'follow',
            body: buildBody()
          }).then(accepted).catch(function () {
            postSbPayload(payload).then(resolve).catch(function (err) {
              reject(err || new Error('Không gửi được chunk upload.'));
            });
          });
          return;
        }
        postSbPayload(payload).then(resolve).catch(reject);
      });
    }

    function sbDelay(ms) {
      return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
    }

    function sbRandomSubmitDelayMs() {
      return 5000 + Math.floor(Math.random() * 5001);
    }

    function sbSequentialSubmitDelay(labels, states, percents, nextIndex, requestStartedAt) {
      var targetGapMs = sbRandomSubmitDelayMs();
      var elapsedMs = Math.max(0, Date.now() - Number(requestStartedAt || Date.now()));
      var waitMs = Math.max(0, targetGapMs - elapsedMs);
      sbSetSubmitButtons(true, 'Chờ gửi tiếp...', '.72');
      if (labels && states && percents && typeof nextIndex === 'number' && labels[nextIndex]) {
        states[nextIndex] = 'pending';
        percents[nextIndex] = Math.max(0, Number(percents[nextIndex] || 0));
        sbSetSubmitStepStates(labels, states, percents, false, percents[nextIndex] || 0);
      }
      if (waitMs <= 0) return Promise.resolve();
      return sbDelay(waitMs);
    }

    function isRetryableSbSubmitError(err) {
      var message = String((err && err.message) || err || '').toLowerCase();
      if (!message) return true;
      return !(
        message.indexOf('qua han') >= 0 ||
        message.indexOf('quá hạn') >= 0 ||
        message.indexOf('toi da') >= 0 ||
        message.indexOf('tối đa') >= 0 ||
        message.indexOf('missing selfbooth folder') >= 0 ||
        message.indexOf('không render') >= 0
      );
    }

    function postSbPayloadWithRetry(payload, options) {
      options = options || {};
      var maxAttempts = Math.max(1, Number(options.attempts || 3));
      var attempt = 0;
      function alreadyAccepted() {
        return checkSbSubmitStatus(payload).then(function (status) {
          if (status && status.ok) return status;
          if (status && status.error && !status.pending && !isRetryableSbSubmitError(status.error)) {
            throw new Error(status.error);
          }
          return null;
        }).catch(function (err) {
          if (!isRetryableSbSubmitError(err)) throw err;
          return null;
        });
      }
      function run() {
        attempt += 1;
        return alreadyAccepted().then(function (accepted) {
          if (accepted) return accepted;
          if (options.onAttempt) options.onAttempt(attempt, maxAttempts);
          return postSbPayloadRobust(payload);
        }).catch(function (err) {
          if (attempt >= maxAttempts || !isRetryableSbSubmitError(err)) {
            throw err;
          }
          if (options.onRetry) options.onRetry(attempt, maxAttempts, err);
          return sbDelay(900 * attempt).then(function () {
            return alreadyAccepted().then(function (accepted) {
              return accepted || run();
            });
          });
        });
      }
      return run();
    }

    function onD(res) {
      hide('ptbLoading');
      if (res.error) { showE('Lỗi', res.error); return; }
      var header = document.querySelector('#ptb-app .ptb-hd');
      var title = document.querySelector('#ptb-app .ptb-hd h1');
      var desc = document.querySelector('#ptb-app .ptb-hd p');
      var cta = $('ptbCtaBtn');
      if (header) header.classList.remove('is-selfbooth');
      if (title) title.textContent = 'DiciiBooth Gallery';
      if (desc) desc.textContent = 'Xem va tai anh, video ky niem cua ban.';
      if (cta) cta.style.display = '';
      var driveFolderId = res.folder_id || res.folderId || fid;
      var driveFolderUrl = res.folder_url || res.folderUrl || ('https://drive.google.com/drive/folders/' + encodeURIComponent(driveFolderId));
      allF = res.files || [];
      var filesLoading = Boolean(res.lazyFiles || res.loadingFiles) && !allF.length;
      if (!allF.length && !filesLoading) { showE('Trống', 'Folder không chứa file PTB nào.'); return; }
      if (res.folderName) { var fl = $('ptbFolder'); fl.textContent = '📁 ' + res.folderName; fl.style.display = 'inline-block'; }

      var bl = [], ca = [], vi = [];
      allF.forEach(function (f) { f.category === 'blended' ? bl.push(f) : f.category === 'card' ? ca.push(f) : vi.push(f); });
      imgF = bl.concat(ca);

      var html = '';

      // Thời hạn lưu trữ (14 ngày)
      if (allF.length > 0) {
        var minTime = allF[0].dateCreated;
        for (var i = 1; i < allF.length; i++) { if (allF[i].dateCreated < minTime) minTime = allF[i].dateCreated; }
        var expTime = minTime + 14 * 86400000; // +14 ngày
        html += '<div style="background:#F7F1E4;border:1px solid #DDE4D3;border-radius:14px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:10px;font-size:.82rem;color:#536048"><span style="font-size:1.2rem">⏳</span><span>Ảnh/Video của bạn được chụp lúc <b>' + fDate(minTime) + '</b>. Vui lòng tải xuống để lưu trữ trước <b>' + fDate(expTime).split(" ")[1] + '</b> nhé!</span></div>';
      } else if (filesLoading) {
        html += '<div style="background:#F7F1E4;border:1px solid #DDE4D3;border-radius:14px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:10px;font-size:.82rem;color:#536048"><span class="sb-loading-dots">Đang tải danh sách ảnh</span><span>Trang đã mở xong, ảnh sẽ hiện dần sau khi Drive trả dữ liệu.</span></div>';
      }

      // Lưu ý chất lượng
      html += '<div style="background:#F7F1E4;border:1px solid #D8AF91;border-radius:14px;padding:14px 18px;margin-bottom:24px;display:flex;align-items:center;gap:10px;font-size:.82rem;color:#B7791F"><span style="font-size:1.2rem">💡</span><span>Các bạn hãy <b>tải về</b> để xem chất lượng gốc cao nhất nhé! Trên web đặc biệt là video đã bị nén chất lượng.</span></div>';

      html += '<div style="background:#FCFAF5;border-radius:18px;padding:14px 16px;margin-bottom:24px;box-shadow:0 6px 24px rgba(83,96,72,.12);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">';
      html += '<div style="font-size:.84rem;color:#536048;font-weight:700">Tải file gốc chất lượng cao từ Google Drive</div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
      html += '<a href="' + driveFolderUrl + '" target="_blank" rel="noopener nofollow" style="padding:10px 16px;border-radius:12px;border:none;background:linear-gradient(135deg,#899979,#536048);color:#FCFAF5;font-size:.8rem;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;gap:6px">Tải tất cả trong Drive</a>';
      html += '</div></div>';

      // Quảng cáo AdSense (Dynamic)
      html += '<div style="margin: 24px auto; max-width: 100%; text-align: center; overflow: hidden; border-radius: 12px;">';
      html += '<!--ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3156025796030783" data-ad-slot="1309734785" data-ad-format="auto" data-full-width-responsive="true"></ins-->';
      html += '</div>';
      if (filesLoading) {
        html += secHTML('p', '🖼️', 'Ảnh đang tải', 'Đang nạp', '<div style="padding:22px;color:#536048;font-weight:900"><span class="sb-loading-dots">Đang lấy ảnh từ Drive</span></div>');
      }
      if (bl.length) html += secHTML('p', '🖼️', 'Ảnh Chụp', bl.length + ' ảnh', imgGrid(bl));
      if (ca.length) html += secHTML('c', '🃏', 'Ảnh Card', ca.length + ' ảnh', imgGrid(ca));
      if (vi.length) {
        html += secHTML('v', '🎬', 'Video Timelapse', vi.length + ' video', vidGrid(vi));
        html += '<div style="background:#DDE4D3;border:1px solid #C8D0BD;border-radius:12px;padding:12px 16px;margin-top:10px;margin-bottom:24px;font-size:.8rem;color:#536048;display:flex;align-items:center;gap:8px"><span style="font-size:1rem">🎬</span><span>Video trên web đã bị nén. Hãy <b>tải về</b> để xem chất lượng gốc Full HD!</span></div>';
      }
      // Link file gốc
      var driveLink = driveFolderUrl;
      html += '<div style="background:#FCFAF5;border-radius:16px;padding:18px;margin-bottom:24px;box-shadow:0 2px 12px rgba(83,96,72,.1)">';
      html += '<div style="font-weight:700;color:#536048;margin-bottom:10px;font-size:.9rem">📂 Link file gốc</div>';
      html += '<div style="font-size:.82rem;color:#766E60">Nếu bạn không tải về được thì có thể <a href="' + driveLink + '" target="_blank" rel="noopener nofollow" style="color:#536048;font-weight:700;text-decoration:underline">mở trong DRIVE</a></div>';
      html += '</div>';
      html += ptbShareCardHtml('');
      // Giới thiệu DiciiBooth
      html += '<div style="background:linear-gradient(135deg,#F7F1E4,#EFE2C8);border-radius:16px;padding:20px;margin-bottom:24px;box-shadow:0 2px 12px rgba(83,96,72,.1);border:1px solid #DDE4D3">';
      html += '<div style="text-align:center;margin-bottom:12px"><span style="font-size:1.4rem;font-weight:800;color:#536048">🎨 DiciiBooth</span></div>';
      html += '<div style="font-size:.82rem;color:#766E60;line-height:1.7;text-align:center">';
      html += '<b>Photobooth chuyên nghiệp</b> cho các sự kiện, cưới hỏi, lễ hội.<br>';
      html += '📸 <b>In ảnh lấy ngay trong 20 giây</b> • Chất lượng in nhiệt cao cấp, bền màu theo thời gian<br>';
      html += '✨ Công nghệ <b>làm đẹp da, trắng hồng tự nhiên</b><br>';
      html += '📷 Máy ảnh kỹ thuật số cao cấp <b>Canon EOS 5D Mark IV</b><br><br>';
      html += '<span style="font-size:.7rem;color:#A39885">&copy; ' + new Date().getFullYear() + ' DiciiBooth since 2026.</span>';
      html += '</div></div>';
      $('ptbContent').innerHTML = html;
      $('ptbContent').style.display = 'block';
      // Nút CTA luôn hiện, không cần toggle

      // Khởi tạo Fancybox cho ảnh PTB (dùng Fancybox 3 đã load sẵn trên Blogger)
      setTimeout(function () {
        ptbEnsureFancybox(function () {
          jQuery('[data-fancybox="ptb-gallery"]').fancybox({
            buttons: ['zoom', 'download', 'slideShow', 'close'],
            loop: true,
            protect: false,
            animationEffect: 'zoom-in-out',
            transitionEffect: 'slide',
            idleTime: 4
          });
        });
      }, 300);

      // Khởi tạo quảng cáo AdSense sau khi render DOM
      setTimeout(function () {
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
          console.error("AdSense error:", e);
        }
      }, 100);
    }

    function secHTML(cls, ico, title, count, content) {
      return '<div class="ptb-sec"><div class="ptb-sh"><div class="ptb-si ' + cls + '">' + ico + '</div><div class="ptb-st">' + title + '</div><div class="ptb-sn">' + count + '</div></div>' + content + '</div>';
    }

    function imgGrid(files) {
      var h = '<div class="ptb-media-grid">';
      files.forEach(function (f) {
        var gi = imgF.indexOf(f);
        var thumbSrc = f.previewUrl || ('https://lh3.googleusercontent.com/d/' + f.id + '=w1200');
        var fullSrc = f.originalImageUrl || f.downloadUrl || thumbSrc;
        h += '<div class="ptb-media-card">';
        h += '<a href="' + fullSrc + '" data-fancybox="ptb-gallery" data-caption="' + f.name + '" class="ptb-media-link">';
        h += '<img src="' + thumbSrc + '" alt="' + f.name + '" loading="lazy" class="no-fancybox ptb-media-img" onerror="this.src=\'' + f.thumbnailUrl + '\'">';
        h += '</a>';
        h += '<div style="padding:10px 12px;display:flex;align-items:center;gap:8px">';
        h += '<div style="flex:1;overflow:hidden">';
        h += '<div style="font-size:.76rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4D493F">' + f.name + '</div>';
        h += '<div style="font-size:.68rem;color:#A39885;margin-top:2px">' + fDate(f.dateCreated) + ' • ' + fS(f.size) + '</div>';
        h += '</div>';
        h += '<button title="Tải file gốc" onclick="event.stopPropagation();ptbDl(\'' + f.downloadUrl + '\',\'' + f.name + '\',this)" style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#899979,#536048);border:none;color:#FCFAF5;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.86rem;flex-shrink:0">⬇</button>';
        h += '</div></div>';
      });
      return h + '</div>';
    }

    function vidGrid(files) {
      // Grid giống ảnh, size tương đương
      var h = '<div class="ptb-media-grid">';
      files.forEach(function (f) {
        var ico = f.category === 'card_video' ? '🃏' : '⏱️';
        h += '<div class="ptb-media-card">';
        h += '<iframe src="' + f.viewUrl + '" class="ptb-video-frame" allow="autoplay; fullscreen" allowfullscreen></iframe>';
        h += '<div style="padding:10px 12px 6px;display:flex;align-items:center;gap:8px">';
        h += '<div style="flex:1;overflow:hidden">';
        h += '<div style="font-size:.76rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4D493F">' + ico + ' ' + f.name + '</div>';
        h += '<div style="font-size:.68rem;color:#A39885;margin-top:2px">' + fDate(f.dateCreated) + ' • ' + fS(f.size) + '</div>';
        h += '</div>';
        h += '<a href="' + f.viewUrl + '" target="_blank" rel="noopener" style="width:34px;height:34px;border-radius:10px;background:#DDE4D3;color:#536048;text-decoration:none;display:flex;align-items:center;justify-content:center;font-size:.86rem;flex-shrink:0" title="Mở video">▶</a>';
        h += '<button title="Tải video gốc" onclick="ptbDl(\'' + f.downloadUrl + '\',\'' + f.name + '\',this)" style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#899979,#536048);border:none;color:#FCFAF5;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.86rem;flex-shrink:0">⬇</button>';
        h += '</div>';
        h += '<div style="padding:0 12px 10px;font-size:.7rem;color:#B4534F;text-align:center">⚠️ Tải về để xem chất lượng gốc</div>';
        h += '</div>';
      });
      return h + '</div>';
    }

    function fDate(ms) {
      if (!ms) return '';
      var d = new Date(ms);
      var hh = d.getHours().toString().padStart(2, '0');
      var mm = d.getMinutes().toString().padStart(2, '0');
      var dd = d.getDate().toString().padStart(2, '0');
      var mt = (d.getMonth() + 1).toString().padStart(2, '0');
      return hh + ':' + mm + ' ' + dd + '/' + mt + '/' + d.getFullYear();
    }
    function fS(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
    function showE(t, m) { hide('ptbLoading'); var e = $('ptbError'); e.style.display = 'block'; e.innerHTML = '<div class="ptb-err"><h3>⚠️ ' + t + '</h3><p>' + m + '</p></div>'; }
    function hide(id) { $(id).style.cssText = 'display:none !important' }
    function $(id) { return document.getElementById(id) }

    window.ptbDl = function (u, n, btnEl) {
      if (btnEl) { var ot = btnEl.textContent; btnEl.textContent = '⏳'; btnEl.style.pointerEvents = 'none'; }
      var link = document.createElement('a');
      link.href = u;
      link.target = '_blank';
      link.rel = 'noopener';
      link.download = n || '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (btnEl) {
        btnEl.textContent = '✅';
        btnEl.style.background = '#899979';
        setTimeout(function () {
          btnEl.textContent = ot;
          btnEl.style.pointerEvents = '';
          btnEl.style.background = '';
        }, 1600);
      }
    };

    window.ptbZip = function (btnEl) {
      var ot = btnEl ? btnEl.textContent : '';
      if (btnEl) { btnEl.textContent = '⏳ Đang tạo ZIP...'; btnEl.disabled = true; btnEl.style.opacity = '.75'; }
      var zipUrl = API + '?action=createZip&id=' + encodeURIComponent(fid);
      fetch(zipUrl, { redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) {
          var data = JSON.parse(t);
          if (data.error) throw new Error(data.error);
          ptbDl(data.url, data.name || 'DiciiBooth.zip', null);
          if (btnEl) btnEl.textContent = '✅ Đã tạo ZIP';
        })
        .catch(function () {
          var cb = 'ptbZipCb_' + Date.now();
          window[cb] = function (data) {
            delete window[cb];
            if (data && data.url) {
              ptbDl(data.url, data.name || 'DiciiBooth.zip', null);
              if (btnEl) btnEl.textContent = '✅ Đã tạo ZIP';
            } else {
              alert((data && data.error) || 'Không tạo được ZIP lúc này.');
              if (btnEl) btnEl.textContent = ot;
            }
          };
          var s = document.createElement('script');
          s.src = zipUrl + '&callback=' + cb;
          s.onerror = function () {
            alert('Không tạo được ZIP lúc này.');
            if (btnEl) btnEl.textContent = ot;
          };
          document.body.appendChild(s);
        })
        .finally(function () {
          if (btnEl) {
            setTimeout(function () {
              btnEl.disabled = false;
              btnEl.style.opacity = '';
              if (btnEl.textContent.indexOf('✅') === 0) btnEl.textContent = ot;
            }, 2200);
          }
        });
    };

  })();
