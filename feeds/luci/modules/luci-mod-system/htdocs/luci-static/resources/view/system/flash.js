'use strict';
'require view';
'require dom';
'require form';
'require rpc';
'require fs';
'require ui';
'require request';

var isReadonlyView = !L.hasViewPermission();

var callSystemValidateFirmwareImage = rpc.declare({
	object: 'system',
	method: 'validate_firmware_image',
	params: [ 'path' ],
	expect: { '': { valid: false, forcable: true } }
});

function findStorageSize(procmtd, procpart) {
	var kernsize = 0, rootsize = 0, wholesize = 0;

	procmtd.split(/\n/).forEach(function(ln) {
		var match = ln.match(/^mtd\d+: ([0-9a-f]+) [0-9a-f]+ "(.+)"$/),
		    size = match ? parseInt(match[1], 16) : 0;

		switch (match ? match[2] : '') {
		case 'linux':
		case 'firmware':
			if (size > wholesize)
				wholesize = size;
			break;

		case 'kernel':
		case 'kernel0':
			kernsize = size;
			break;

		case 'rootfs':
		case 'rootfs0':
		case 'ubi':
		case 'ubi0':
			rootsize = size;
			break;
		}
	});

	if (wholesize > 0)
		return wholesize;
	else if (kernsize > 0 && rootsize > kernsize)
		return kernsize + rootsize;

	procpart.split(/\n/).forEach(function(ln) {
		var match = ln.match(/^\s*\d+\s+\d+\s+(\d+)\s+(\S+)$/);
		if (match) {
			var size = parseInt(match[1], 10);

			if (!match[2].match(/\d/) && size > 2048 && wholesize == 0)
				wholesize = size * 1024;
		}
	});

	return wholesize;
}


var mapdata = { actions: {}, config: {} };

return view.extend({
	load: function() {
		var tasks = [
			L.resolveDefault(fs.stat('/lib/upgrade/platform.sh'), {}),
			fs.trimmed('/proc/sys/kernel/hostname'),
			fs.trimmed('/proc/mtd'),
			fs.trimmed('/proc/partitions'),
			fs.trimmed('/proc/mounts')
		];

		return Promise.all(tasks);
	},



	handleFileUpload: function(storage_size, has_rootfs_data, container) {
		var fileInput = container.querySelector('input[type="file"]');
		var file = fileInput.files[0];
		var progressDiv = container.querySelector('.upload-progress');
		
		if (!file) {
			ui.addNotification(null, E('p', _('파일을 선택해주세요.')));
			return;
		}

		// 업로드 진행 표시 - 박스 콘텐츠 영역에 맞춤
		var uploadBox = container.querySelector('.upload-box');
		var boxContentWidth = uploadBox ? (uploadBox.offsetWidth - 40) : 600; // padding 20px * 2 제외
		console.log('Box content width:', boxContentWidth);
		var progress = E('div', { 
			'class': 'cbi-progressbar', 
			'title': '0%', 
			'style': 'width: ' + boxContentWidth + 'px;'
		}, E('div', { 'style': 'width:0' }));
		dom.content(progressDiv, [
			E('p', _('파일 업로드 중...')),
			progress
		]);
		progressDiv.style.display = 'block';

		// 파일 업로드 실행
		var data = new FormData();
		data.append('sessionid', rpc.getSessionID());
		data.append('filename', '/tmp/firmware.bin');
		data.append('filedata', file);

		request.post(L.env.cgi_base + '/cgi-upload', data, {
			timeout: 0,
			progress: function(pev) {
				var percent = (pev.loaded / pev.total) * 100;
				progress.setAttribute('title', '%.2f%%'.format(percent));
				progress.firstElementChild.style.width = '%.2f%%'.format(percent);
			}
		}).then(L.bind(function(res) {
			var reply = res.json();
			
			// 진행바를 100% 완료 상태로 유지 (숨기지 않음)
			var progress = progressDiv.querySelector('.cbi-progressbar');
			var progressText = progressDiv.querySelector('p');
			if (progress) {
				progress.setAttribute('title', '100%');
				progress.firstElementChild.style.width = '100%';
			}
			if (progressText) {
				progressText.textContent = _('파일 업로드 완료');
			}

			if (L.isObject(reply) && reply.failure) {
				ui.addNotification(null, E('p', _('Upload request failed: %s').format(reply.message)));
				return;
			}

			// 파일 검증 시작
			this.handleImageValidation(storage_size, has_rootfs_data, container, reply);
		}, this)).catch(function(err) {
			progressDiv.style.display = 'none';
			ui.addNotification(null, E('p', _('Upload failed: %s').format(err.message)));
		});
	},

	handleImageValidation: function(storage_size, has_rootfs_data, container, uploadReply) {
		// 기존 검증 결과 및 설정 섹션 클리어
		var existingValidation = container.querySelector('.validation-progress');
		if (existingValidation) existingValidation.remove();
		
		var existingSettings = container.querySelector('.settings-section');
		if (existingSettings) existingSettings.remove();
		
		// 검증 중 표시를 업로드 진행바 아래에 추가
		var progressDiv = container.querySelector('.upload-progress');
		dom.append(progressDiv.parentNode, [
			E('div', { 'class': 'validation-progress', 'style': 'margin-top: 20px;' }, [
				E('p', { 'class': 'spinning' }, _('이미지 파일 검증 중...'))
			])
		]);

		// 이미지 검증 실행
		Promise.all([
			callSystemValidateFirmwareImage('/tmp/firmware.bin'),
			fs.exec('/sbin/sysupgrade', ['--test', '/tmp/firmware.bin'])
		]).then(L.bind(function(results) {
			var validateResult = results[0];
			var testResult = results[1];
			
			// 검증 완료 후에도 "이미지 파일 검증 중..." 메시지 유지 (감추지 않음)
			var validationProgress = container.querySelector('.validation-progress');
			if (validationProgress) {
				var progressText = validationProgress.querySelector('p');
				if (progressText) {
					progressText.className = ''; // spinning 클래스 제거
					progressText.textContent = _('이미지 파일 검증 완료');
				}
			}
			
			this.showValidationResult(storage_size, has_rootfs_data, container, {
				upload: uploadReply,
				validate: validateResult,
				test: testResult
			});
			
			// 검증 완료 후 파일 선택의 "적용" 버튼 비활성화
			var uploadApplyBtn = container.querySelector('.button-row .cbi-button-action.important');
			if (uploadApplyBtn) {
				uploadApplyBtn.disabled = true;
				uploadApplyBtn.style.opacity = '0.5';
			}
		}, this)).catch(function(err) {
			var validationProgress = container.querySelector('.validation-progress');
			if (validationProgress) {
				var progressText = validationProgress.querySelector('p');
				if (progressText) {
					progressText.className = '';
					progressText.textContent = _('이미지 파일 검증 실패');
				}
			}
			ui.addNotification(null, E('p', _('Validation failed: %s').format(err.message)));
		});
	},

	showValidationResult: function(storage_size, has_rootfs_data, container, results) {
		// 설정 섹션이 없으면 생성
		var settingsDiv = container.querySelector('.settings-section');
		if (!settingsDiv) {
			settingsDiv = E('div', { 'class': 'settings-section', 'style': 'margin-top: 20px;' });
			container.appendChild(settingsDiv);
		}
		
		var is_valid = results.validate.valid;
		var is_forceable = results.validate.forceable;
		var allow_backup = results.validate.allow_backup;
		var is_too_big = (storage_size > 0 && results.upload.size > storage_size);
		
		// 디버깅용 로그
		console.log('Validation results:', {
			is_valid: is_valid,
			is_forceable: is_forceable, 
			allow_backup: allow_backup,
			is_too_big: is_too_big,
			test_code: results.test.code,
			storage_size: storage_size,
			upload_size: results.upload.size
		});

		// 옵션 체크박스들
		var opts = {
			keep: [E('input', { type: 'checkbox', checked: allow_backup }), true, '-n'],
			force: [E('input', { type: 'checkbox' }), true, '--force'],
			skip_orig: [E('input', { type: 'checkbox' }), true, '-u'],
			backup_pkgs: [E('input', { type: 'checkbox' }), true, '-k']
		};

		var validationContent = [
			E('p', _('업로드가 완료되었습니다. 아래에서 설정 정보를 확인하고 계속하려면 적용을 클릭하세요.')),
			E('ul', {}, [
				results.upload.size ? E('li', {}, '%s: %1024.2mB'.format(_('크기'), results.upload.size)) : '',
				results.upload.checksum ? E('li', {}, '%s: %s'.format(_('MD5'), results.upload.checksum)) : '',
				results.upload.sha256sum ? E('li', {}, '%s: %s'.format(_('SHA256'), results.upload.sha256sum)) : ''
			])
		];

		// 설정 유지 옵션
		if (allow_backup) {
			validationContent.push(E('p', {}, E('label', { 'class': 'btn' }, [
				opts.keep[0], ' ', _('설정 유지 (현재 설정을 유지합니다)')
			])));
		} else {
			validationContent.push(E('p', { 'class': 'alert-message' }, [
				_('업로드된 펌웨어는 현재 설정 유지를 허용하지 않습니다.')
			]));
			opts.keep[0].disabled = true;
		}

		// 경고 메시지들
		if (is_too_big) {
			validationContent.push(E('p', { 'class': 'alert-message' }, [
				_('플래시 메모리 크기보다 큰 이미지를 업로드하려고 합니다. 이미지 파일을 확인해주세요!')
			]));
		}

		if (!is_valid) {
			validationContent.push(E('p', { 'class': 'alert-message' }, [
				results.test.stderr || '',
				results.test.stderr ? E('br') : '',
				_('업로드된 이미지 파일에 지원되는 형식이 포함되어 있지 않습니다.')
			]));
		}

		if (results.test.code != 0) {
			validationContent.push(E('p', { 'class': 'alert-message danger' }, E('label', {}, [
				_('이미지 검사 실패:'),
				E('br'), E('br'),
				results.test.stderr
			])));
		}

		// 강제 업그레이드 옵션
		if ((!is_valid || is_too_big || results.test.code != 0) && is_forceable) {
			validationContent.push(E('p', {}, E('label', { 'class': 'btn alert-message danger' }, [
				opts.force[0], ' ', _('강제 업그레이드'),
				E('br'), E('br'),
				_('이미지 형식 검사가 실패해도 강제로 플래시합니다. 펌웨어가 올바르고 장치에 적합한 경우에만 선택하세요!')
			])));
		} else if (hasErrors) {
			// 에러가 있지만 강제 업그레이드가 불가능한 경우
			console.log('Errors exist but force upgrade not available');
		}

		// 실행 버튼
		var hasErrors = !is_valid || is_too_big || results.test.code != 0;
		console.log('Button state:', { hasErrors: hasErrors, disabled: hasErrors });
		
		// 정상적인 버튼 활성화 로직 복원
		var executeBtn = E('button', {
			'class': 'btn cbi-button-action important',
			'disabled': hasErrors,
			'click': L.bind(this.handleSysupgradeConfirm, this, opts, container)
		}, [ _('적용') ]);
		
		console.log('Execute button created with disabled:', hasErrors);
		
		// 버튼이 DOM에 추가된 후 실제 상태 확인
		setTimeout(function() {
			console.log('Button DOM properties:', {
				disabled: executeBtn.disabled,
				className: executeBtn.className,
				style: executeBtn.style.cssText
			});
			// 명시적으로 disabled 속성 제거 (hasErrors가 false인 경우)
			if (!hasErrors) {
				executeBtn.disabled = false;
				executeBtn.removeAttribute('disabled');
				console.log('Button explicitly enabled');
			}
		}, 100);

		validationContent.push(E('div', { 'class': 'button-group', 'style': 'margin-top: 20px;' }, [
			executeBtn,
			' ',
			E('button', {
				'class': 'btn',
				'click': function() {
					fs.remove('/tmp/firmware.bin');
					// 설정 섹션 내용 초기화
					dom.content(settingsDiv, [
						E('h3', _('설정 정보 추가')),
						E('p', { 'style': 'color: red; font-size: 14px;' }, _('(주의: 특별한 경우가 아니면 설정사항을 미적용!!)'))
					]);
				}
			}, [ _('취소') ])
		]));

		// 이벤트 리스너 추가 - 강제 업그레이드 체크박스
		if (hasErrors && is_forceable) {
			opts.force[0].addEventListener('change', function(ev) {
				var newDisabled = hasErrors && !ev.target.checked;
				executeBtn.disabled = newDisabled;
				console.log('Force checkbox changed:', ev.target.checked, 'Button disabled:', newDisabled);
			});
		}


		// 기존 설정 섹션에 내용 추가
		dom.append(settingsDiv, validationContent);
	},

	handleSysupgradeConfirm: function(opts, container, ev) {
		console.log('handleSysupgradeConfirm called', opts, container);
		
		var settingsDiv = container.querySelector('.settings-section');
		if (!settingsDiv) {
			// 설정 섹션이 없으면 컨테이너 자체를 사용
			settingsDiv = container;
		}
		
		// 플래시 진행 상태를 기존 내용 아래에 추가
		dom.append(settingsDiv, [
			E('div', { 'class': 'upgrade-progress', 'style': 'margin-top: 20px;' }, [
				E('h3', _('펌웨어 업데이트 진행 중')),
				E('div', { 'class': 'alert-message warning', 'style': 'padding: 20px; text-align: center;' }, [
					E('p', { 'class': 'spinning', 'style': 'font-size: 18px; margin-bottom: 10px;' }, _('시스템 업데이트 중입니다.')),
					E('p', { 'style': 'font-weight: bold; color: red;' }, _('장치의 전원을 끄지 마세요!')),
					E('p', _('몇 분 후에 다시 연결을 시도하세요. 설정에 따라 장치에 다시 접근하기 위해 컴퓨터의 주소를 갱신해야 할 수 있습니다.'))
				])
			])
		]);

		// sysupgrade 인수 구성
		var args = [];
		for (var key in opts) {
			if (opts[key][0].checked == opts[key][1])
				args.push(opts[key][2]);
		}
		args.push('/tmp/firmware.bin');

		console.log('sysupgrade args:', args);

		// sysupgrade 실행
		fs.exec('/sbin/sysupgrade', args).then(function(result) {
			console.log('sysupgrade result:', result);
		}).catch(function(err) {
			console.error('sysupgrade error:', err);
			ui.addNotification(null, E('p', _('Upgrade failed: %s').format(err.message)));
		});

		// 재연결 대기 (비활성화 - 업데이트 화면 유지)
		// if (opts['keep'][0].checked)
		//	ui.awaitReconnect(window.location.host);
		// else
		//	ui.awaitReconnect('192.168.1.1', 'openwrt.lan');
	},

	render: function(rpc_replies) {
		var has_sysupgrade = (rpc_replies[0].type == 'file'),
		    hostname = rpc_replies[1],
		    procmtd = rpc_replies[2],
		    procpart = rpc_replies[3],
		    procmounts = rpc_replies[4],
		    has_rootfs_data = (procmtd.match(/"rootfs_data"/) != null) || (procmounts.match("overlayfs:\/overlay \/ ") != null),
		    storage_size = findStorageSize(procmtd, procpart),
		    m, s, o, ss;

		m = new form.JSONMap(mapdata, _('버전 관리'));
		m.tabbed = false;
		m.readonly = isReadonlyView;

		s = m.section(form.NamedSection, 'actions', _('새로운 펌웨어 이미지 플래시'));
		s.description = _('현재 실행 중인 펌웨어를 교체하려면 여기에서 sysupgrade 와 호환되는 이미지를 업로드하십시오.');

		if (has_sysupgrade) {
			// 바로 업로드 인터페이스 표시
			o = s.option(form.DummyValue, 'upload_interface', '');
			o.render = L.bind(function(storage_size, has_rootfs_data, section_id, option_id) {
				var container = E('div', { 'class': 'flash-container' });
				
				// 업로드 인터페이스를 바로 생성
				this.createUploadInterface(container, storage_size, has_rootfs_data);
				
				return container;
			}, this, storage_size, has_rootfs_data);
		} else {
			o = s.option(form.DummyValue, 'no_sysupgrade', '');
			o.render = function() {
				return E('p', { 'class': 'alert-message' }, 
					_('죄송합니다. sysupgrade 지원이 없습니다. 새 펌웨어 이미지를 수동으로 플래시해야 합니다. 장치별 설치 지침은 위키를 참조하십시오.'));
			};
		}

		return m.render();
	},

	createUploadInterface: function(container, storage_size, has_rootfs_data) {
		var self = this;
		
		// 전체 UI 생성 - 박스 형태로 스타일링
		dom.content(container, [
			E('div', { 
				'class': 'upload-box',
				'style': 'background: url(/luci-static/bootstrap/bg-tile.png) repeat; background-color: rgba(255,255,255,0.8); background-blend-mode: overlay; opacity: 0.95; border: 1px solid #ddd; border-radius: 8px; padding: 20px 70px 20px 20px; margin-top: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8); display: inline-block; width: fit-content;'
			}, [
				E('div', { 'style': 'margin-bottom: 15px;' }, [
					E('span', { 'style': 'font-size: 1.2em; font-weight: bold; margin-right: 10px;' }, _('업데이트 파일 업로드')),
					E('span', { 'style': 'font-size: 0.95em; color: #666;' }, _('(업데이트 후에 시스템을 재시작 하지 않으면 설정 백업 기능을 사용 할 수 없습니다)'))
				]),
			
			// 파일 업로드 섹션
			E('div', { 'class': 'upload-section' }, [
				E('input', {
					type: 'file',
					id: 'firmware-file-' + Date.now(),
					accept: '.bin,.img,.trx',
					style: 'display: none;',
					change: function(ev) {
						var file = ev.target.files[0];
						var fileNameInput = container.querySelector('.filename-input');
						
						if (file) {
							fileNameInput.value = file.name;
						} else {
							fileNameInput.value = '';
						}
					}
				}),
				E('div', { 'class': 'button-row', 'style': 'display: flex; gap: 10px; align-items: center; margin: 20px 0 5px 0;' }, [
					E('button', {
						'class': 'btn cbi-button',
						'click': function() {
							container.querySelector('input[type="file"]').click();
						}
					}, [ _('파일 선택') ]),
					E('input', {
						'class': 'filename-input',
						'type': 'text',
						'readonly': true,
						'placeholder': _('선택된 파일명 입력'),
						'style': 'width: 300px; margin: 0 10px;'
					}),
					E('button', {
						'class': 'btn cbi-button-action important',
						'click': function() {
							self.handleFileUpload(storage_size, has_rootfs_data, container);
						}
					}, [ _('적용') ]),
					E('button', {
						'class': 'btn',
						'click': function() {
							container.querySelector('input[type="file"]').value = '';
							container.querySelector('.filename-input').value = '';
							var progressDiv = container.querySelector('.upload-progress');
							if (progressDiv) progressDiv.style.display = 'none';
						}
					}, [ _('취소') ])
				]),
				E('div', { 'class': 'upload-progress', 'style': 'display: none; margin: 10px 0; box-sizing: border-box;' })
			])
			]) // upload-box 닫기
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
