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

	uploadFileCustom(path, progressStatusNode) {
		return new Promise((resolveFn, rejectFn) => {
			ui.showModal(_('Uploading file…'), [
				E('p', _('Please select the file to upload.')),
				E('div', { 'style': 'display:flex' }, [
					E('div', { 'class': 'left', 'style': 'flex:1' }, [
						E('input', {
							type: 'file',
							style: 'display:none',
							change(ev) {
								const modal = dom.parent(ev.target, '.modal');
								const body = modal.querySelector('p');
								const upload = modal.querySelector('.cbi-button-action.important');
								const file = ev.currentTarget.files[0];

								if (file == null)
									return;

								dom.content(body, [
									E('ul', {}, [
										E('li', {}, [ '%s: %s'.format(_('Name'), file.name.replace(/^.*[\\\/]/, '')) ]),
										E('li', {}, [ '%s: %1024mB'.format(_('Size'), file.size) ])
									])
								]);

								upload.disabled = false;
								upload.focus();
							}
						}),
						E('button', {
							'class': 'btn cbi-button',
							'click': function(ev) {
								ev.target.previousElementSibling.click();
							}
						}, [ _('Browse…') ])
					]),
					E('div', { 'class': 'right', 'style': 'flex:1' }, [
						E('button', {
							'class': 'btn',
							'click': function() {
								ui.hideModal();
								rejectFn(new Error(_('Upload has been cancelled')));
							}
						}, [ _('Cancel') ]),
						' ',
						E('button', {
							'class': 'btn cbi-button-action important',
							'disabled': true,
							'click': function(ev) {
								const input = dom.parent(ev.target, '.modal').querySelector('input[type="file"]');

								if (!input.files[0])
									return;

								const progress = E('div', { 'class': 'cbi-progressbar', 'title': '0%' }, E('div', { 'style': 'width:0' }));

								ui.showModal(_('Uploading file…'), [ progress ]);

								const data = new FormData();

								data.append('sessionid', rpc.getSessionID());
								data.append('filename', path);
								data.append('filedata', input.files[0]);

								const filename = input.files[0].name;

								request.post(`${L.env.cgi_base}/cgi-upload`, data, {
									timeout: 0,
									progress(pev) {
										const percent = (pev.loaded / pev.total) * 100;

										if (progressStatusNode)
											progressStatusNode.data = '%.2f%%'.format(percent);

										progress.setAttribute('title', '%.2f%%'.format(percent));
										progress.firstElementChild.style.width = '%.2f%%'.format(percent);
									}
								}).then(res => {
									const reply = res.json();

									ui.hideModal();

									if (L.isObject(reply) && reply.failure) {
										ui.addNotification(null, E('p', _('Upload request failed: %s').format(reply.message)));
										rejectFn(new Error(reply.failure));
									}
									else {
										reply.name = filename;
										resolveFn(reply);
									}
								}, err => {
									ui.hideModal();
									rejectFn(err);
								});
							}
						}, [ _('Upload') ])
					])
				])
			]);
		});
	},

	handleSysupgrade: function(storage_size, has_rootfs_data, ev) {
		return this.uploadFileCustom('/tmp/firmware.bin', ev.target.firstChild)
			.then(L.bind(function(btn, reply) {
				btn.firstChild.data = _('Checking image…');

				ui.showModal(_('Checking image…'), [
					E('span', { 'class': 'spinning' }, _('Verifying the uploaded image file.'))
				]);

				return callSystemValidateFirmwareImage('/tmp/firmware.bin')
					.then(function(res) { return [ reply, res ]; });
			}, this, ev.target))
			.then(L.bind(function(btn, reply) {
				return fs.exec('/sbin/sysupgrade', [ '--test', '/tmp/firmware.bin' ])
					.then(function(res) { reply.push(res); return reply; });
			}, this, ev.target))
			.then(L.bind(function(btn, res) {
				/* sysupgrade opts table  [0]:checkbox element [1]:check condition [2]:args to pass */
				var opts = {
				    keep : [ E('input', { type: 'checkbox' }), false, '-n' ],
				    force : [ E('input', { type: 'checkbox' }), true, '--force' ],
				    skip_orig : [ E('input', { type: 'checkbox' }), true, '-u' ],
				    backup_pkgs : [ E('input', { type: 'checkbox' }), true, '-k' ],
				    },
				    is_valid = res[1].valid,
				    is_forceable = res[1].forceable,
				    allow_backup = res[1].allow_backup,
				    is_too_big = (storage_size > 0 && res[0].size > storage_size),
				    body = [];

				body.push(E('p', _("The flash image was uploaded. Below is the checksum and file size listed, compare them with the original file to ensure data integrity. <br /> Click 'Continue' below to start the flash procedure.")));
				body.push(E('ul', {}, [
					res[0].size ? E('li', {}, '%s: %1024.2mB'.format(_('Size'), res[0].size)) : '',
					res[0].checksum ? E('li', {}, '%s: %s'.format(_('MD5'), res[0].checksum)) : '',
					res[0].sha256sum ? E('li', {}, '%s: %s'.format(_('SHA256'), res[0].sha256sum)) : ''
				]));

				body.push(E('p', {}, E('label', { 'class': 'btn' }, [
					opts.keep[0], ' ', _('Keep settings and retain the current configuration')
				])));

				if (!is_valid || is_too_big)
					body.push(E('hr'));

				if (is_too_big)
					body.push(E('p', { 'class': 'alert-message' }, [
						_('It appears that you are trying to flash an image that does not fit into the flash memory, please verify the image file!')
					]));

				if (!is_valid)
					body.push(E('p', { 'class': 'alert-message' }, [
						res[2].stderr ? res[2].stderr : '',
						res[2].stderr ? E('br') : '',
						res[2].stderr ? E('br') : '',
						_('The uploaded image file does not contain a supported format. Make sure that you choose the generic image format for your platform.')
					]));

				if (!allow_backup) {
					body.push(E('p', { 'class': 'alert-message' }, [
						_('The uploaded firmware does not allow keeping current configuration.')
					]));
					opts.keep[0].disabled = true;
				} else {
					opts.keep[0].checked = true;

					if (has_rootfs_data) {
						body.push(E('p', {}, E('label', { 'class': 'btn' }, [
							opts.skip_orig[0], ' ', _('Skip from backup files that are equal to those in /rom')
						])));
					}

					body.push(E('p', {}, E('label', { 'class': 'btn' }, [
						opts.backup_pkgs[0], ' ', _('Include in backup a list of current installed packages at /etc/backup/installed_packages.txt')
					])));
				};

				var cntbtn = E('button', {
					'class': 'btn cbi-button-action important',
					'click': ui.createHandlerFn(this, 'handleSysupgradeConfirm', btn, opts),
				}, [ _('Continue') ]);

				if (res[2].code != 0) {
					body.push(E('p', { 'class': 'alert-message danger' }, E('label', {}, [
						_('Image check failed:'),
						E('br'), E('br'),
						res[2].stderr
					])));
				};

				if ((!is_valid || is_too_big || res[2].code != 0) && is_forceable) {
					body.push(E('p', {}, E('label', { 'class': 'btn alert-message danger' }, [
						opts.force[0], ' ', _('Force upgrade'),
						E('br'), E('br'),
						_('Select \'Force upgrade\' to flash the image even if the image format check fails. Use only if you are sure that the firmware is correct and meant for your device!')
					])));
					cntbtn.disabled = true;
				};


				body.push(E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.createHandlerFn(this, function(ev) {
							return fs.remove('/tmp/firmware.bin').finally(ui.hideModal);
						})
					}, [ _('Cancel') ]), ' ', cntbtn
				]));

				opts.force[0].addEventListener('change', function(ev) {
					cntbtn.disabled = !ev.target.checked;
				});

				opts.keep[0].addEventListener('change', function(ev) {
					opts.skip_orig[0].disabled = !ev.target.checked;
					opts.backup_pkgs[0].disabled = !ev.target.checked;

				});

				ui.showModal(_('Flash image?'), body);
			}, this, ev.target))
			.catch(function(e) { ui.addNotification(null, E('p', e.message)) })
			.finally(L.bind(function(btn) {
				btn.firstChild.data = _('Flash image...');
			}, this, ev.target));
	},

	handleSysupgradeConfirm: function(btn, opts, ev) {
		btn.firstChild.data = _('Flashing…');

		ui.showModal(_('Flashing…'), [
			E('p', { 'class': 'spinning' }, _('The system is flashing now.<br /> DO NOT POWER OFF THE DEVICE!<br /> Wait a few minutes before you try to reconnect. It might be necessary to renew the address of your computer to reach the device again, depending on your settings.'))
		]);

		var args = [];

		for (var key in opts)
			/* if checkbox == condition add args to sysupgrade */
			if (opts[key][0].checked == opts[key][1])
				args.push(opts[key][2]);

		args.push('/tmp/firmware.bin');

		/* Currently the sysupgrade rpc call will not return, hence no promise handling */
		fs.exec('/sbin/sysupgrade', args);

		if (opts['keep'][0].checked)
			ui.awaitReconnect(window.location.host);
		else
			ui.awaitReconnect('192.168.1.1', 'openwrt.lan');
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

		m = new form.JSONMap(mapdata, _('Flash operations'));
		m.tabbed = false;
		m.readonly = isReadonlyView;

		s = m.section(form.NamedSection, 'actions', _('Actions'));

		o = s.option(form.SectionValue, 'actions', form.NamedSection, 'actions', 'actions', _('Flash new firmware image'),
			has_sysupgrade
				? _('Upload a sysupgrade-compatible image here to replace the running firmware.')
				: _('Sorry, there is no sysupgrade support present; a new firmware image must be flashed manually. Please refer to the wiki for device specific install instructions.'));

		ss = o.subsection;

		if (has_sysupgrade) {
			o = ss.option(form.Button, 'sysupgrade', _('Image'));
			o.inputstyle = 'action important';
			o.inputtitle = _('Flash image...');
			o.onclick = L.bind(this.handleSysupgrade, this, storage_size, has_rootfs_data);
		}

		return m.render();
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
