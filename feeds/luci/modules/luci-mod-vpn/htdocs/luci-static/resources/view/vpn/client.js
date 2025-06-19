'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require ui';
'require poll';
'require fs';

// Add styles safely after DOM is ready
function addStyles() {
	if (document.getElementById('ewsvpn-styles')) return;
	
	var style = document.createElement('style');
	style.id = 'ewsvpn-styles';
	style.textContent = `
/* Tab Styles - 제공된 코드와 동일한 스타일 */
.cbi-tabmenu > li {
  min-width: 120px;
  max-width: 120px;
  flex: 0 0 120px !important;
  justify-content: center;
  text-align: center;
}
.cbi-tabmenu > li > a {
  width: 100%;
  text-align: center;
}

/* Service Control Styles */
.ewsvpn-status {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 40px 60px 40px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #dc3545;
    width: calc(100% - 80px);
}
.ewsvpn-status.running { 
    border-left-color: #28a745; 
}
.ewsvpn-status-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    margin-right: 12px;
    background: #dc3545;
    animation: blink 1.5s infinite;
}
.ewsvpn-status-dot.running {
    background: #28a745;
    animation: pulse 2s ease-in-out infinite;
}
@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.3; }
}
@keyframes pulse {
    0% { 
        opacity: 1; 
        transform: scale(1); 
    }
    50% { 
        opacity: 0.7; 
        transform: scale(1.1); 
    }
    100% { 
        opacity: 1; 
        transform: scale(1); 
    }
}
.ewsvpn-buttons {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin: 40px 40px;
    width: calc(100% - 80px);
}
.ewsvpn-btn {
    width: 120px;
    padding: 12px 0;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: all 0.3s ease;
    text-align: center;
}
.ewsvpn-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.ewsvpn-btn.start { 
    background: #28a745; 
    color: white; 
}
.ewsvpn-btn.start:hover:not(:disabled) { 
    background: #218838; 
}
.ewsvpn-btn.stop { 
    background: #dc3545; 
    color: white; 
}
.ewsvpn-btn.stop:hover:not(:disabled) { 
    background: #c82333; 
}
.ewsvpn-btn.restart { 
    background: #ffc107; 
    color: #000; 
}
.ewsvpn-btn.restart:hover:not(:disabled) { 
    background: #e0a800; 
}
.ewsvpn-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 80px;
    margin: 40px 40px;
    width: calc(100% - 80px);
}
.ewsvpn-panel {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    border-left: 4px solid #17a2b8;
}
.ewsvpn-panel h4 {
    margin: 0 0 10px 0;
    color: #495057;
    font-size: 14px;
    font-weight: 600;
}
.ewsvpn-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
    padding: 0 10px;
}
.ewsvpn-row:last-child {
    margin-bottom: 0;
}

@media (max-width: 600px) {
    .ewsvpn-info { 
        grid-template-columns: 1fr; 
    }
    .ewsvpn-buttons { 
        flex-direction: column; 
    }
}`;
	document.head.appendChild(style);
}

var callServiceAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

var callServiceStatus = rpc.declare({
	object: 'luci',
	method: 'getVPNStatus'
});

var callSystemCommand = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ]
});

function parseConfigFile(content) {
	var config = {};
	var lines = content.split('\n');
	
	lines.forEach(function(line) {
		line = line.trim();
		if (line && !line.startsWith('#')) {
			var parts = line.split('=');
			if (parts.length === 2) {
				var key = parts[0].trim();
				var value = parts[1].trim();
				
				switch(key) {
					case 'home_dir':
					case 'HOME_DIR':
						config.home_dir = value;
						break;
					case 'client_type':
					case 'CLIENT_TYPE':
						config.client_type = value;
						break;
					case 'serv_addr':
					case 'SERV_ADDR':
						config.serv_addr = value;
						break;
					case 'serv_port':
					case 'SERV_PORT':
						config.serv_port = value;
						break;
					case 'user_id':
					case 'USER_ID':
						config.user_id = value;
						break;
					case 'user_passwd':
					case 'USER_PASSWD':
						config.user_passwd = value;
						break;
					case 'force_login':
					case 'FORCE_LOGIN':
						config.force_login = (value.toLowerCase() === 'yes') ? '1' : '0';
						break;
					case 'retry_login':
					case 'RETRY_LOGIN':
						config.retry_login = (value.toLowerCase() === 'yes') ? '1' : '0';
						break;
					case 'log_level':
					case 'LOG_LEVEL':
						config.log_level = value;
						break;
				}
			}
		}
	});
	return config;
}

return view.extend({
	title: _('EWS VPN Client Manager'),

	serviceInfo: { running: false, enabled: false, pid: null },
	logMessages: [],
	statusElements: {},
	pollFn: null,

	handleServiceAction: function(action) {
		var self = this;
		
		ui.showModal(_('Service Control'), [
			E('p', { 'class': 'spinning' }, _('Executing service %s...').format(action))
		]);
		
		self.log('Executing service action: ' + action);
		
		return callServiceAction('ewsvpnc', action).then(function(res) {
			self.log('Service action result: ' + JSON.stringify(res));
			self.log('Service action result type: ' + typeof res);
			self.log('Service action result value: ' + res);
			ui.hideModal();
			
			// Check if result is successful
			// Handle both proper JSON response and direct boolean response
			let isSuccess = false;
			if (res === true) {
				// Direct boolean response (with expect option)
				isSuccess = true;
			} else if (res && res.result === true) {
				// JSON object response
				isSuccess = true;
			} else if (typeof res === 'number' && res === 0) {
				// Some RPC calls may return exit code directly, 0 means success
				isSuccess = true;
			} else if (typeof res === 'number') {
				// For other numeric responses, check actual service status to determine success
				// This handles cases where RPC layer returns unexpected numeric values
				self.log('Numeric response received, checking actual service status...');
				// We'll verify success by checking service status after a delay
			}
			
			if (isSuccess) {
				//ui.addNotification(null, E('p', _('Service %s completed successfully').format(action)), 'info');
				self.log('Service ' + action + ' successful');
			} else {
				let errorMsg = res?.error || 'Unknown error';
				
				// Handle specific error cases
				if (typeof res === 'number') {
					let exitCode = res;
					switch(exitCode) {
						case 0:
							// This should be handled as success above, but just in case
							isSuccess = true;
							//ui.addNotification(null, E('p', _('Service %s completed successfully').format(action)), 'info');
							self.log('Service ' + action + ' successful');
							return;
						case 1:
							errorMsg = 'Service executable not found or not executable';
							break;
						case 2:
							errorMsg = 'Service configuration error or action failed';
							break;
						default:
							errorMsg = `Service failed with exit code ${exitCode}`;
					}
				} else if (res && typeof res.result === 'number') {
					let exitCode = res.result;
					if (exitCode === 0) {
						isSuccess = true;
						//ui.addNotification(null, E('p', _('Service %s completed successfully').format(action)), 'info');
						self.log('Service ' + action + ' successful');
						return;
					} else {
						errorMsg = `Service failed with exit code ${exitCode}`;
					}
				}
				
				ui.addNotification(null, [
					E('p', _('Service %s failed: %s').format(action, errorMsg)),
					E('pre', { 'class': 'alert-message' }, [
						E('div', {}, _('Error code: %s').format(typeof res === 'number' ? res : (res?.result || 'Unknown'))),
						E('div', {}, _('Please check system log for more details'))
					])
				], 'error');
				self.log('Service ' + action + ' failed: ' + errorMsg);
			}

			// Always refresh status after action and determine actual success
			return new Promise(function(resolve) {
				setTimeout(function() {
					self.refreshServiceStatus().then(function(statusRes) {
						// If we got a numeric response, use actual service status to determine success
						if (typeof res === 'number' && res !== 0) {
							let actualSuccess = false;
							if (action === 'start' && statusRes && statusRes.running) {
								actualSuccess = true;
							} else if (action === 'stop' && statusRes && !statusRes.running) {
								actualSuccess = true;
							} else if (action === 'reload' && statusRes && statusRes.running) {
								actualSuccess = true;
							}
							
							if (actualSuccess) {
								// Override the previous error message with success
								//ui.addNotification(null, E('p', _('Service %s completed successfully (verified by status check)').format(action)), 'info');
								self.log('Service ' + action + ' successful (verified by status check)');
							}
						}
					}).finally(resolve);
				}, 2000);
			});
		}).catch(function(err) {
			ui.hideModal();
			var msg = err.message || err.toString();
			ui.addNotification(null, [
				E('p', _('Service action error: %s').format(msg)),
				E('pre', { 'class': 'alert-message' }, _('Please check system log for more details'))
			], 'error');
			self.log('Service action error: ' + msg);
		});
	},

	refreshServiceStatus: function() {
		var self = this;
		self.log('Checking service status...');
		
		return callServiceStatus().then(function(res) {
			self.log('Status check result: ' + JSON.stringify(res));
			
			// Update serviceInfo object
			self.serviceInfo.running = res.running || false;
			self.serviceInfo.enabled = res.enabled || false;
			self.serviceInfo.error = res.error || null;
			self.serviceInfo.pid = res.pid || null;
			
			// Update status display
			var statusText = res.running ? _('Running') : _('Stopped');
			var statusClass = res.running ? 'running' : '';
			
			if (res.error) {
				statusText += ': ' + _(res.error);
			}

			// Update UI elements - ensure proper className assignment
			if (self.statusElements.statusDot) {
				self.statusElements.statusDot.className = 'ewsvpn-status-dot';
				if (res.running) {
					self.statusElements.statusDot.classList.add('running');
				}
			}
			
			if (self.statusElements.text)
				self.statusElements.text.textContent = statusText;
			
			if (self.statusElements.statusContainer) {
				self.statusElements.statusContainer.className = 'ewsvpn-status';
				if (res.running) {
					self.statusElements.statusContainer.classList.add('running');
				}
			}

			// Update button states
			if (self.statusElements.startBtn)
				self.statusElements.startBtn.disabled = res.running;
			
			if (self.statusElements.stopBtn)
				self.statusElements.stopBtn.disabled = !res.running;
			
			if (self.statusElements.restartBtn)
				self.statusElements.restartBtn.disabled = !res.running;
			
			// Update PID display
			if (self.statusElements.pidText) {
				self.statusElements.pidText.textContent = res.pid || '-';
			}
			
			// Update enabled status display
			if (self.statusElements.enabledText) {
				self.statusElements.enabledText.textContent = res.enabled ? _('Yes') : _('No');
			}

			return res;
		});
	},

	updateStatusDisplay: function() {
		var info = this.serviceInfo;
		var els = this.statusElements;

		if (els.statusContainer) {
			els.statusContainer.className = 'ewsvpn-status';
			if (info.running) {
				els.statusContainer.classList.add('running');
			}
		}

		if (els.statusDot) {
			els.statusDot.className = 'ewsvpn-status-dot';
			if (info.running) {
				els.statusDot.classList.add('running');
			}
		}

		if (els.statusText) {
			els.statusText.textContent = info.running ? 
				_('Service Status: Running') : _('Service Status: Stopped');
		}

		if (els.pidText) {
			els.pidText.textContent = info.pid || '-';
		}

		if (els.enabledText) {
			els.enabledText.textContent = info.enabled ? _('Yes') : _('No');
		}

		// Update buttons
		if (els.startBtn) els.startBtn.disabled = info.running;
		if (els.stopBtn) els.stopBtn.disabled = !info.running;
		if (els.restartBtn) els.restartBtn.disabled = !info.running;
	},

	updateConfigDisplay: function() {
		var self = this;
		self.log('Updating config display...');
		try {
			var sections = uci.sections('ewsvpnc', 'ewsvpnc');
			if (sections && sections.length > 0) {
				var cfg = sections[0];
				var els = this.statusElements;
				
				if (els.serverText) {
					var addr = cfg.serv_addr || '172.16.130.26';
					var port = cfg.serv_port || '443';
					els.serverText.textContent = addr + ':' + port;
				}
				
				if (els.userText) {
					els.userText.textContent = cfg.user_id || 'user01';
				}
				
				if (els.homeDirText) {
					els.homeDirText.textContent = cfg.home_dir || '/etc/ewsvpnc';
				}
			}
		} catch (err) {
			self.log('UCI access error: ' + err.message);
		}
	},

	log: function(message) {
		var entry = '[' + new Date().toLocaleTimeString() + '] ' + message;
		this.logMessages.push(entry);
		if (this.logMessages.length > 50) {
			this.logMessages.shift();
		}
		console.log(entry);
	},

	load: function() {
		this.log('Loading EWS VPN Client Manager...');
		return Promise.all([
			uci.load('ewsvpnc'),
			this.refreshServiceStatus(),
			fs.read('/etc/ewsvpnc/ewsvpnc.conf').then(function(content) {
				if (content) {
					var config = parseConfigFile(content);
					Object.keys(config).forEach(function(key) {
						uci.set('ewsvpnc', '@ewsvpnc[0]', key, config[key]);
					});
				}
			}).catch(function(err) {
				console.log('Failed to read config file:', err);
			})
		]);
	},

	render: function() {
		var self = this;
		
		// Add styles first
		addStyles();
		
		var m = new form.Map('ewsvpnc', _('EWS VPN Client Manager'));

		// Create main section with tabs
		var s = m.section(form.TypedSection, 'ewsvpnc', _('EWS VPN Configuration'));
		s.anonymous = true;
		s.addremove = false;

		// Add tabs
		s.tab('service', _('Service Control'));
		s.tab('config', _('VPN Configuration'));

		// Service Control Tab
		var serviceControlOption = s.taboption('service', form.DummyValue, '_service_control', '', '');
		serviceControlOption.renderWidget = function() {
			var statusDiv = E('div', { 'class': 'ewsvpn-status' }, [
				E('div', { 'class': 'ewsvpn-status-dot' }),
				E('span', {}, _('Checking service status...'))
			]);
			
			var btnDiv = E('div', { 'class': 'ewsvpn-buttons' }, [
				E('button', {
					'class': 'ewsvpn-btn start',
					'type': 'button',
					'click': function(ev) {
						ev.preventDefault();
						ev.stopPropagation();
						return self.handleServiceAction('start');
					}
				}, _('▶ Start')),
				E('button', {
					'class': 'ewsvpn-btn stop',
					'type': 'button',
					'disabled': true,
					'click': function(ev) {
						ev.preventDefault();
						ev.stopPropagation();
						return self.handleServiceAction('stop');
					}
				}, _('⏹ Stop')),
				E('button', {
					'class': 'ewsvpn-btn restart',
					'type': 'button',
					'disabled': true,
					'click': function(ev) {
						ev.preventDefault();
						ev.stopPropagation();
						return self.handleServiceAction('reload');
					}
				}, _('🔄 Reload'))
			]);

			var infoDiv = E('div', { 'class': 'ewsvpn-info' }, [
				E('div', { 'class': 'ewsvpn-panel' }, [
					E('h4', {}, _('Current Configuration')),
					E('div', { 'class': 'ewsvpn-row' }, [
						E('span', {}, _('Server:')),
						E('span', {}, '172.16.130.26:443')
					]),
					E('div', { 'class': 'ewsvpn-row' }, [
						E('span', {}, _('User:')),
						E('span', {}, 'user01')
					]),
					E('div', { 'class': 'ewsvpn-row' }, [
						E('span', {}, _('Home Directory:')),
						E('span', {}, '/etc/ewsvpnc')
					])
				]),
				E('div', { 'class': 'ewsvpn-panel' }, [
					E('h4', {}, _('Service Information')),
					E('div', { 'class': 'ewsvpn-row' }, [
						E('span', {}, _('Service Name:')),
						E('span', {}, 'ewsvpnc')
					]),
					E('div', { 'class': 'ewsvpn-row' }, [
						E('span', {}, _('Process ID:')),
						E('span', {}, '-')
					]),
					E('div', { 'class': 'ewsvpn-row' }, [
						E('span', {}, _('Auto Start:')),
						E('span', {}, _('No'))
					])
				])
			]);

			// Store references for later updates
			self.statusElements.statusContainer = statusDiv;
			self.statusElements.statusDot = statusDiv.querySelector('.ewsvpn-status-dot');
			self.statusElements.statusText = statusDiv.querySelector('span');

			// Store button references
			var buttons = btnDiv.querySelectorAll('button');
			self.statusElements.startBtn = buttons[0];
			self.statusElements.stopBtn = buttons[1];
			self.statusElements.restartBtn = buttons[2];

			// Store text element references
			var rows = infoDiv.querySelectorAll('.ewsvpn-row span:last-child');
			if (rows.length >= 6) {
				self.statusElements.serverText = rows[0];
				self.statusElements.userText = rows[1];
				self.statusElements.homeDirText = rows[2];
				// Skip service name (static)
				self.statusElements.pidText = rows[4];
				self.statusElements.enabledText = rows[5];
			}

			return E('div', { 'style': 'padding: 16px 0;' }, [
				statusDiv,
				btnDiv,
				infoDiv
			]);
		};

		// VPN Configuration Tab
		var o = s.taboption('config', form.Value, 'home_dir', _('Home Directory'));
		o.default = '/etc/ewsvpnc';
		o.rmempty = false;

		o = s.taboption('config', form.ListValue, 'client_type', _('Client Type'));
		o.value('1', _('TLC (Linux Normal)'));
		o.value('2', _('TLE (Linux Embedded)'));
		o.default = '2';

		o = s.taboption('config', form.Value, 'serv_addr', _('Server Address'));
		o.default = '172.16.130.26';
		o.rmempty = false;
		o.datatype = 'host';

		o = s.taboption('config', form.Value, 'serv_port', _('Server Port'));
		o.default = '443';
		o.rmempty = false;
		o.datatype = 'port';

		o = s.taboption('config', form.Value, 'user_id', _('User ID'));
		o.default = 'user01';
		o.rmempty = false;

		o = s.taboption('config', form.Value, 'user_passwd', _('Password'));
		o.password = true;
		o.default = 'userpass123!';
		o.rmempty = false;

		o = s.taboption('config', form.Flag, 'force_login', _('Force Login'));
		o.default = '1';
		o.description = _('Forcefully disconnect existing sessions with same credentials');

		o = s.taboption('config', form.Flag, 'retry_login', _('Auto Retry'));
		o.default = '0';
		o.description = _('Automatically retry connection when disconnected');

		o = s.taboption('config', form.Flag, 'enabled', _('Auto Start'));
		o.default = '0';
		o.description = _('Automatically start VPN service on boot');

		o = s.taboption('config', form.ListValue, 'log_level', _('Log Level'));
		o.value('0', _('Quiet (0)'));
		o.value('3', _('Error (3)'));
		o.value('4', _('Warning (4)'));
		o.value('5', _('Notice (5)'));
		o.value('6', _('Info (6)'));
		o.value('7', _('Debug (7)'));
		o.default = '4';

		// Enhanced save handler
		var originalSave = m.save;
		m.save = function() {
			self.log('Saving configuration...');
			
			return originalSave.apply(this, arguments).then(function(result) {
				self.log('Configuration saved successfully');
				
				// Get current configuration values
				var sections = uci.sections('ewsvpnc', 'ewsvpnc');
				if (!sections || sections.length === 0) {
					throw new Error('No ewsvpnc configuration found');
				}
				
				var cfg = sections[0];
				var confContent = [
					'# For more information, refer README.txt!',
					'',
					'home_dir=' + (cfg.home_dir || '/etc/ewsvpnc'),
					'client_type=' + (cfg.client_type || '2'),
					'#os_name=Linux',
					'#process_name=svpnc',
					'#vir_dev_name=tun',
					'serv_addr=' + (cfg.serv_addr || '172.16.130.26'),
					'serv_port=' + (cfg.serv_port || '443'),
					'user_id=' + (cfg.user_id || 'user01'),
					'user_passwd=' + (cfg.user_passwd || ''),
					'force_login=' + (cfg.force_login === '1' ? 'yes' : 'no'),
					'#retry_login=no',
					'#log_level=4',
					'#log_size=1048576',
					'#log_count=4',
					'#log_rotate_interval=10',
					''
				].join('\n');

				// Save to ewsvpnc.conf
				return fs.write('/etc/ewsvpnc/ewsvpnc.conf', confContent).then(function() {
					self.log('Configuration saved to ewsvpnc.conf');
					ui.addNotification(null, E('p', _('Configuration saved successfully')), 'info');
					
					// Update displays
					self.updateConfigDisplay();
					
					// Restart if running to apply new settings
					if (self.serviceInfo.running) {
						self.log('Service is running, restarting to apply new configuration...');
						return self.handleServiceAction('reload');
					}
					
					return result;
				});
			}).catch(function(err) {
				var msg = err.message || err.toString();
				self.log('Configuration save failed: ' + msg);
				ui.addNotification(null, E('p', _('Save failed: %s').format(msg)), 'error');
				throw err;
			});
		};

		// Start status polling
		if (this.pollFn) {
			poll.remove(this.pollFn);
		}
		this.pollFn = poll.add(function() {
			return self.refreshServiceStatus();
		}, 10); // Check every 10 seconds

		// Render with tab style
		return m.render().then(function(mapEl) {
			// Add tab style at the top of the map element
			var tabStyle = E('style', {}, `
.cbi-tabmenu > li {
  min-width: 120px;
  max-width: 120px;
  flex: 0 0 120px !important;
  justify-content: center;
  text-align: center;
}
.cbi-tabmenu > li > a {
  width: 100%;
  text-align: center;
}
`);
			mapEl.insertBefore(tabStyle, mapEl.firstChild);

			// Initial update after render
			requestAnimationFrame(function() {
				self.log('Initializing UI components...');
				self.updateStatusDisplay();
				self.updateConfigDisplay();
				self.log('EWS VPN Client Manager initialized successfully');
			});

			return mapEl;
		});
	},

	handleSaveApply: function(ev) {
		return this.handleSave(ev).then(function() {
			window.setTimeout(function() {
				location.reload();
			}, 500);
		});
	},

	handleSave: function(ev) {
		return this.map.save().then(function() {
			ui.addNotification(null, E('p', _('Configuration has been saved.')), 'info');
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to save the configuration: %s').format(err.message)), 'error');
		});
	},

	handleReset: function(ev) {
		return this.map.reset().then(function() {
			ui.addNotification(null, E('p', _('Configuration has been reset.')), 'info');
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to reset the configuration: %s').format(err.message)), 'error');
		});
	},

	destroy: function() {
		this.log('Destroying EWS VPN Client Manager view...');
		if (this.pollFn) {
			poll.remove(this.pollFn);
			this.pollFn = null;
			this.log('Status polling stopped');
		}
	}
});
