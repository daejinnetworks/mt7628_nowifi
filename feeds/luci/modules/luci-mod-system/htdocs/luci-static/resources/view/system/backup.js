'use strict';
'require view';
'require dom';
'require form';
'require rpc';
'require fs';
'require ui';
'require uci';
'require request';

var isReadonlyView = !L.hasViewPermission();
var mapdata = { backup: {}, restore: {} };
var uploadedBackupFile = null; // 업로드된 백업 파일명 저장
var rollbackBackupFile = null; // rollback용 백업 파일명 저장

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('system'),
			fs.trimmed('/proc/mounts')
		]);
	},

	handleCreateBackup: function(hostname, ev) {
		var btn = ev.currentTarget;
		var date = new Date();
		var dateStr = date.getFullYear() + 
			String(date.getMonth() + 1).padStart(2, '0') + 
			String(date.getDate()).padStart(2, '0');
		var filename = hostname + '-backup-' + dateStr + '.tar.gz';
		var finalPath = '/tmp/' + filename;

		btn.disabled = true;
		btn.firstChild.data = _('Creating backup...');

		return fs.exec('/sbin/sysupgrade', ['--list-backup'])
			.then(L.bind(function(listRes) {
				if (listRes.code === 0 && listRes.stdout) {
					return fs.write('/tmp/backup_files.txt', listRes.stdout)
						.then(function(writeRes) {
							return fs.exec('/bin/tar', ['-czf', finalPath, '-T', '/tmp/backup_files.txt']);
						});
				} else {
					throw new Error('Could not get backup file list - code: ' + listRes.code);
				}
			}, this))
			.then(L.bind(function(tarRes) {
				if (tarRes.code === 0) {
					return fs.stat(finalPath).then(function(stat) {
						this.updateBackupUI(hostname);
						fs.remove('/tmp/backup_files.txt');
					}.bind(this)).catch(function(statErr) {
						ui.addNotification(null, E('p', _('Backup creation failed - file not found')));
					});
				} else {
					ui.addNotification(null, E('p', _('Backup failed: %s').format(tarRes.stderr || 'unknown error')));
				}
			}, this))
			.catch(function(e) {
				ui.addNotification(null, E('p', _('Error: %s').format(e.message)));
			})
			.finally(function() {
				btn.disabled = false;
				btn.firstChild.data = _('백업파일 만들기');
			});
	},

	handleDownloadBackup: function(filename, ev) {
		var filepath = '/tmp/' + filename;
		
		fs.stat(filepath).then(function(stat) {
			var form = E('form', {
				'method': 'post',
				'action': L.env.cgi_base + '/cgi-download',
				'enctype': 'application/x-www-form-urlencoded'
			}, [
				E('input', { 'type': 'hidden', 'name': 'sessionid', 'value': rpc.getSessionID() }),
				E('input', { 'type': 'hidden', 'name': 'path', 'value': filepath }),
				E('input', { 'type': 'hidden', 'name': 'filename', 'value': filename })
			]);

			ev.currentTarget.parentNode.appendChild(form);
			form.submit();
			form.parentNode.removeChild(form);
		}).catch(function(e) {
			ui.addNotification(null, E('p', _('Download failed - file not found: %s').format(filename)));
		});
	},

	handleDeleteBackup: function(filename, ev) {
		if (!confirm(_('Delete backup file %s?').format(filename)))
			return;

		var filepath = '/tmp/' + filename;

		return fs.remove(filepath)
			.then(L.bind(function() {
				var hostname = uci.get('system', '@system[0]', 'hostname') || 'UI-2PV';
				this.updateBackupUI(hostname);
			}, this))
			.catch(function(e) {
				ui.addNotification(null, E('p', _('Delete error: %s').format(e.message)));
			});
	},

	updateBackupInfo: function(hostname) {
		if (!hostname) {
			var h = uci.get('system', '@system[0]', 'hostname') || 'UI-2PV';
			this.updateBackupUI(h);
		} else {
			this.updateBackupUI(hostname);
		}
	},

	updateBackupUI: function(hostname) {
		var date = new Date();
		var dateStr = date.getFullYear() + 
			String(date.getMonth() + 1).padStart(2, '0') + 
			String(date.getDate()).padStart(2, '0');
		var filename = hostname + '-backup-' + dateStr + '.tar.gz';
		var filepath = '/tmp/' + filename;

		var filenameInput = document.getElementById('backup-filename-input');
		var createBtn = document.getElementById('create-backup-btn');
		var downloadBtn = document.getElementById('download-backup-btn');
		var deleteBtn = document.getElementById('delete-backup-btn');

		fs.stat(filepath).then(L.bind(function(stat) {
			if (stat.type === 'file') {
				if (filenameInput) {
					filenameInput.value = filename;
					filenameInput.style.color = '#333';
					filenameInput.style.fontWeight = 'bold';
				}
				if (createBtn) createBtn.style.display = '';
				if (downloadBtn) downloadBtn.style.display = '';
				if (deleteBtn) deleteBtn.style.display = '';
			}
		}, this)).catch(function(e) {
			if (filenameInput) {
				filenameInput.value = '';
				filenameInput.style.color = '#999';
				filenameInput.style.fontWeight = 'normal';
			}
			if (createBtn) createBtn.style.display = '';
			if (downloadBtn) downloadBtn.style.display = 'none';
			if (deleteBtn) deleteBtn.style.display = 'none';
		});
	},


	handleRestoreConfirm: function(btn, ev) {
		var backupPath = uploadedBackupFile ? '/tmp/' + uploadedBackupFile : '/tmp/backup.tar.gz';
		
		// 먼저 백업 파일 검증
		return fs.exec('/bin/tar', [ '-tzf', backupPath ])
			.then(L.bind(function(res) {
				if (res.code != 0) {
					ui.addNotification(null, E('p', _('업로드된 백업 파일을 읽을 수 없습니다.')));
					return;
				}

				// 백업 파일 내용 확인 모달 표시
				ui.showModal(_('백업을 적용하시겠습니까?'), [
					E('p', _('업로드된 백업 파일이 유효하며 아래 나열된 파일들을 포함하고 있습니다. "계속"을 눌러 백업을 복원하거나, "취소"를 눌러 작업을 중단하세요.')),
					E('p', { 'style': 'color: #666; font-style: italic;' }, _('※ 복원 전에 현재 설정이 자동으로 rollback용 백업파일로 저장됩니다.')),
					E('pre', {}, [ res.stdout ]),
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn',
							'click': ui.createHandlerFn(this, function(ev) {
								ui.hideModal();
							})
						}, [ _('취소') ]), ' ',
						E('button', {
							'class': 'btn cbi-button-action important',
							'click': ui.createHandlerFn(this, 'handleRestoreExecute', backupPath)
						}, [ _('계속') ])
					])
				]);
			}, this))
			.catch(function(e) { 
				ui.addNotification(null, E('p', e.message));
			});
	},

	handleRestoreExecute: function(backupPath, ev) {
		ui.hideModal();
		
		// 1단계: rollback용 현재 설정 백업 생성
		var hostname = uci.get('system', '@system[0]', 'hostname') || 'UI-2PV';
		var date = new Date();
		var dateStr = date.getFullYear() + 
			String(date.getMonth() + 1).padStart(2, '0') + 
			String(date.getDate()).padStart(2, '0');
		var rollbackFilename = hostname + '-rollback-' + dateStr + '.tar.gz';
		var rollbackPath = '/tmp/' + rollbackFilename;
		
		ui.addNotification(null, E('p', _('복원 전 현재 설정을 백업하는 중...')));
		
		return fs.exec('/sbin/sysupgrade', ['--list-backup'])
			.then(L.bind(function(listRes) {
				if (listRes.code === 0 && listRes.stdout) {
					return fs.write('/tmp/backup_files.txt', listRes.stdout)
						.then(function(writeRes) {
							return fs.exec('/bin/tar', ['-czf', rollbackPath, '-T', '/tmp/backup_files.txt']);
						});
				} else {
					throw new Error('Could not get backup file list - code: ' + listRes.code);
				}
			}, this))
			.then(L.bind(function(tarRes) {
				if (tarRes.code === 0) {
					// rollback 백업 성공, 이제 복원 진행
					rollbackBackupFile = rollbackFilename; // rollback 파일명 저장
					ui.addNotification(null, E('p', _('rollback 백업 완료: %s').format(rollbackFilename)));
					fs.remove('/tmp/backup_files.txt');
					
					// 2단계: 실제 복원 실행
					return fs.exec('/sbin/sysupgrade', [ '--restore-backup', backupPath ]);
				} else {
					throw new Error('Rollback backup failed: ' + (tarRes.stderr || 'unknown error'));
				}
			}, this))
			.then(L.bind(function(res) {
				if (res.code != 0) {
					ui.addNotification(null, E('p', _('복원 실패: %d').format(res.code)));
					return;
				}
				ui.addNotification(null, E('p', _('백업 복원이 완료되었습니다. rollback 파일: %s').format(rollbackFilename)));
				ui.addNotification(null, E('p', _('설정을 적용하려면 수동으로 재부팅하세요.')));
				
				// 복원 완료 후 "복원 취소" 버튼 표시
				var restoreCancelBtn = document.getElementById('restore-cancel-btn');
				if (restoreCancelBtn) {
					restoreCancelBtn.style.display = '';
				}
				return;
			}, this))
			.catch(function(e) { 
				ui.addNotification(null, E('p', _('오류: %s').format(e.message)));
			});
	},

	handleFirstboot: function(ev) {
		if (!confirm(_('Erase all settings?')))
			return;

		ui.showModal(_('Erasing...'), [
			E('p', { 'class': 'spinning' }, _('Erasing configuration...'))
		]);

		fs.exec('/sbin/firstboot', [ '-r', '-y' ]);
		ui.awaitReconnect('192.168.1.1', 'openwrt.lan');
	},

	render: function(rpc_replies) {
		var procmounts = rpc_replies[1];
		var has_rootfs_data = (procmounts.match("overlayfs:\/overlay \/ ") != null);
		var hostname = uci.get('system', '@system[0]', 'hostname') || 'UI-2PV';
		var m, s, o;

		m = new form.JSONMap(mapdata, _('Backup & Restore'));
		m.readonly = isReadonlyView;
		m.title = '<div style="margin-top: 20px;">' + _('Backup & Restore') + '</div>';

		// 백업 섹션 - backup1.png/backup2.png 구조
		s = m.section(form.NamedSection, 'backup', 'backup', '<div style="margin: 25px 0 5px 0;">' + _('백업') + '</div>');

		// 백업 파일 정보와 버튼들을 표시할 영역
		o = s.option(form.DummyValue, 'backup_controls', '');
		o.rawhtml = true;
		o.cfgvalue = function(section_id) {
			var date = new Date();
			var dateStr = date.getFullYear() + 
				String(date.getMonth() + 1).padStart(2, '0') + 
				String(date.getDate()).padStart(2, '0');
			var expectedFilename = hostname + '-backup-' + dateStr + '.tar.gz';
			
			return '<div id="backup-controls" class="upload-box" style="' +
				'background: url(/luci-static/bootstrap/bg-tile.png) repeat; ' +
				'background-color: rgba(255,255,255,0.8); ' +
				'background-blend-mode: overlay; ' +
				'opacity: 0.95; ' +
				'border: 1px solid #ddd; ' +
				'border-radius: 8px; ' +
				'padding: 20px 50px 20px 20px; ' +
				'margin-top: 0px; ' +
				'box-shadow: 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8); ' +
				'display: inline-block; ' +
				'width: fit-content; ' +
			'">' +
				'<div style="display: flex; align-items: center; margin-bottom: 20px; gap: 20px;">' +
					'<span style="font-size: 16px; font-weight: 600; color: #333; min-width: 120px;">' + _('파일로 백업하기') + '</span>' +
					'<span style="font-weight: 500; min-width: 120px;">' + _('준비된 백업 파일') + '</span>' +
					'<input type="text" id="backup-filename-input" readonly style="' +
						'width: 300px; ' +
						'padding: 8px 12px; ' +
						'border: 1px solid #ccc; ' +
						'border-radius: 4px; ' +
						'background-color: #f9f9f9; ' +
						'color: #999; ' +
						'font-size: 14px;' +
					'" placeholder="' + expectedFilename + '" />' +
				'</div>' +
				'<div id="backup-buttons" style="display: flex; gap: 10px; margin-left: 140px;">' +
					'<button id="create-backup-btn" class="btn cbi-button-action">' + _('백업파일 만들기') + '</button>' +
					'<button id="download-backup-btn" class="btn cbi-button-action" style="display: none;">' + _('백업 파일 다운로드') + '</button>' +
					'<button id="delete-backup-btn" class="btn cbi-button-negative" style="display: none;">' + _('백업 파일 지우기') + '</button>' +
				'</div>' +
			'</div>';
		};

		// 복원 섹션 - recovery.png 구조  
		s = m.section(form.NamedSection, 'restore', 'restore', '<div style="margin-top: 30px;">' + _('복원') + '</div>');

		// 복원 박스
		o = s.option(form.DummyValue, 'restore_controls', '');
		o.rawhtml = true;
		o.cfgvalue = function(section_id) {
			var restoreContent = '<div class="upload-box" style="' +
				'background: url(/luci-static/bootstrap/bg-tile.png) repeat; ' +
				'background-color: rgba(255,255,255,0.8); ' +
				'background-blend-mode: overlay; ' +
				'opacity: 0.95; ' +
				'border: 1px solid #ddd; ' +
				'border-radius: 8px; ' +
				'padding: 20px 50px 20px 20px; ' +
				'margin-top: 0px; ' +
				'box-shadow: 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8); ' +
				'display: inline-block; ' +
				'width: fit-content; ' +
			'">' +
				'<div style="display: flex; align-items: center; margin-bottom: 20px; gap: 20px;">' +
					'<span style="font-size: 16px; font-weight: 600; color: #333; min-width: 120px;">' + _('설정 복원') + '</span>' +
					'<span style="font-weight: 500; min-width: 180px;">' + _('복원을 위해 업로드된 파일 정보') + '</span>' +
					'<span id="restore-file-status" style="color: #999; font-weight: 500;">' + _('파일없음') + '</span>' +
				'</div>' +
				'<div style="display: flex; align-items: center; margin-bottom: 15px; gap: 20px;">' +
					'<span style="font-weight: 500; min-width: 120px;">' + _('백업된 파일 업로드') + '</span>' +
					'<input type="file" id="restore-file-input" style="display: none;" />' +
					'<button id="restore-file-select-btn" class="btn cbi-button">' + _('파일 선택') + '</button>' +
					'<input type="text" id="restore-filename-input" readonly placeholder="' + _('선택된 파일 없음') + '" style="width: 300px; padding: 6px 10px; margin: 0 10px; border: 1px solid #ccc; border-radius: 3px; color: #999;" />' +
				'</div>';

			if (has_rootfs_data) {
				restoreContent += '<div style="display: flex; align-items: center; gap: 20px;">' +
					'<span style="min-width: 120px;"></span>' +
					'<button id="restore-reset-btn" class="btn cbi-button-action">' + _('백업파일의 설정 대로 복원') + '</button>' +
					'<button id="restore-cancel-btn" class="btn cbi-button-negative" style="display: none;">' + _('복원 취소') + '</button>' +
				'</div>';
			}

			restoreContent += '</div>';
			return restoreContent;
		};

		return m.render().then(L.bind(function(rendered) {
			setTimeout(L.bind(function() {
				var createBtn = document.getElementById('create-backup-btn');
				var downloadBtn = document.getElementById('download-backup-btn');
				var deleteBtn = document.getElementById('delete-backup-btn');
				
				if (createBtn) {
					createBtn.addEventListener('click', L.bind(this.handleCreateBackup, this, hostname));
				}
				
				if (downloadBtn) {
					downloadBtn.addEventListener('click', L.bind(function() {
						var date = new Date();
						var dateStr = date.getFullYear() + 
							String(date.getMonth() + 1).padStart(2, '0') + 
							String(date.getDate()).padStart(2, '0');
						var filename = hostname + '-backup-' + dateStr + '.tar.gz';
						this.handleDownloadBackup(filename, { currentTarget: downloadBtn });
					}, this));
				}
				
				if (deleteBtn) {
					deleteBtn.addEventListener('click', L.bind(function() {
						var date = new Date();
						var dateStr = date.getFullYear() + 
							String(date.getMonth() + 1).padStart(2, '0') + 
							String(date.getDate()).padStart(2, '0');
						var filename = hostname + '-backup-' + dateStr + '.tar.gz';
						this.handleDeleteBackup(filename, { currentTarget: deleteBtn });
					}, this));
				}
				
				// 복원 버튼 이벤트 리스너
				var restoreFileInput = document.getElementById('restore-file-input');
				var restoreFileSelectBtn = document.getElementById('restore-file-select-btn');
				var restoreFilenameInput = document.getElementById('restore-filename-input');
				var restoreFileStatus = document.getElementById('restore-file-status');
				var restoreCancelBtn = document.getElementById('restore-cancel-btn');
				var restoreResetBtn = document.getElementById('restore-reset-btn');
				
				// 파일 선택 버튼 클릭 - 직접 파일 선택 대화상자 열기
				if (restoreFileSelectBtn && restoreFileInput) {
					restoreFileSelectBtn.addEventListener('click', function() {
						restoreFileInput.click();
					});
				}
				
				// 파일 선택 시 자동 업로드 실행
				if (restoreFileInput && restoreFilenameInput && restoreFileStatus) {
					restoreFileInput.addEventListener('change', L.bind(function(ev) {
						var file = ev.target.files[0];
						if (file) {
							// 파일명 및 상태 표시
							restoreFilenameInput.value = file.name;
							restoreFilenameInput.style.color = '#333';
							restoreFileStatus.textContent = _('업로드 중...');
							restoreFileStatus.style.color = '#0066cc';
							
							// 직접 업로드 실행
							var data = new FormData();
							data.append('sessionid', rpc.getSessionID());
							data.append('filename', '/tmp/' + file.name);
							data.append('filedata', file);
							
							request.post(L.env.cgi_base + '/cgi-upload', data, {
								timeout: 0
							}).then(L.bind(function(res) {
								var reply = res.json();
								if (L.isObject(reply) && reply.failure) {
									restoreFileStatus.textContent = _('업로드 실패');
									restoreFileStatus.style.color = '#cc0000';
									ui.addNotification(null, E('p', _('업로드 실패: %s').format(reply.message)));
									return;
								}
								
								// 업로드 성공
								uploadedBackupFile = file.name; // 파일명 저장
								restoreFileStatus.textContent = file.name + ' (업로드 완료)';
								restoreFileStatus.style.color = '#333';
								// "복원 취소" 버튼은 실제 복원 완료 후에만 표시
							}, this)).catch(function(err) {
								restoreFileStatus.textContent = _('업로드 실패');
								restoreFileStatus.style.color = '#cc0000';
								ui.addNotification(null, E('p', _('업로드 실패: %s').format(err.message)));
							});
						} else {
							restoreFilenameInput.value = '';
							restoreFilenameInput.style.color = '#999';
							restoreFileStatus.textContent = _('파일없음');
							restoreFileStatus.style.color = '#999';
							if (restoreCancelBtn) {
								restoreCancelBtn.style.display = 'none';
							}
						}
					}, this));
				}
				
				// 복원 취소 버튼 클릭 (rollback 실행)
				if (restoreCancelBtn && restoreFileInput && restoreFilenameInput && restoreFileStatus) {
					restoreCancelBtn.addEventListener('click', L.bind(function() {
						if (!rollbackBackupFile) {
							ui.addNotification(null, E('p', _('rollback 백업 파일이 없습니다. 복원 작업을 먼저 실행해주세요.')));
							return;
						}
						
						if (!confirm(_('현재 설정을 rollback 백업(%s)으로 되돌리시겠습니까?').format(rollbackBackupFile))) {
							return;
						}
						
						var rollbackPath = '/tmp/' + rollbackBackupFile;
						fs.stat(rollbackPath).then(L.bind(function(stat) {
							if (stat.type === 'file') {
								// rollback 복원 실행
								ui.addNotification(null, E('p', _('rollback 복원 실행 중...')));
								fs.exec('/sbin/sysupgrade', [ '--restore-backup', rollbackPath ])
									.then(function(res) {
										if (res.code != 0) {
											ui.addNotification(null, E('p', _('rollback 복원 실패: %d').format(res.code)));
											return;
										}
										ui.addNotification(null, E('p', _('rollback 복원이 완료되었습니다. 수동으로 재부팅하세요.')));
									})
									.catch(function(e) {
										ui.addNotification(null, E('p', _('rollback 오류: %s').format(e.message)));
									});
							} else {
								ui.addNotification(null, E('p', _('rollback 백업 파일을 찾을 수 없습니다.')));
							}
						}, this)).catch(function() {
							ui.addNotification(null, E('p', _('rollback 백업 파일을 찾을 수 없습니다.')));
						});
					}, this));
				}
				
				if (restoreResetBtn) {
					restoreResetBtn.addEventListener('click', L.bind(function() {
						// 업로드된 백업 파일이 있는지 확인
						if (!uploadedBackupFile) {
							ui.addNotification(null, E('p', _('복원할 백업 파일이 없습니다. 먼저 파일을 선택해주세요.')));
							return;
						}
						
						var backupPath = '/tmp/' + uploadedBackupFile;
						fs.stat(backupPath).then(L.bind(function(stat) {
							if (stat.type === 'file') {
								// 백업 파일로 복원
								this.handleRestoreConfirm(restoreResetBtn, {});
							} else {
								ui.addNotification(null, E('p', _('복원할 백업 파일이 없습니다. 먼저 파일을 선택해주세요.')));
							}
						}, this)).catch(function() {
							ui.addNotification(null, E('p', _('복원할 백업 파일이 없습니다. 먼저 파일을 선택해주세요.')));
						});
					}, this));
				}
				
				this.updateBackupUI(hostname);
			}, this), 200);
			
			return rendered;
		}, this));
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
