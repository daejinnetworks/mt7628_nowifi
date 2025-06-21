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
/* Version Info Styles */
.ewsvpn-version-info {
    margin: 0 40px 20px 40px;
}
.ewsvpn-version-info p {
    margin: 0;
    padding: 15px 20px;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #17a2b8;
    font-family: monospace;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
}
.ewsvpn-version-info p::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(45deg, transparent 98%, #17a2b8 100%);
    opacity: 0.1;
}
.ewsvpn-version-info span {
    display: block;
    line-height: 1.5;
    color: #495057;
}
.ewsvpn-version-info span:first-child {
    color: #17a2b8;
    font-weight: bold;
}

/* Tab Styles */
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

var callVPNVersion = rpc.declare({
	object: 'luci',
	method: 'getVPNVersion'
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
	configFileData: {}, // Store config file settings separately
	configChanged: false, // Track if config file has changes

	handleServiceAction: function(action) {
		var self = this;
		
		ui.showModal(_('Service Control'), [
			E('p', { 'class': 'spinning' }, _('Executing service %s...').format(action))
		]);
		
		return callServiceAction('ewsvpnc', action).then(function(res) {
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
				// We'll verify success by checking service status after a delay
			}
			
			if (!isSuccess) {
				let errorMsg = res?.error || 'Unknown error';
				
				// Handle specific error cases
				if (typeof res === 'number') {
					let exitCode = res;
					switch(exitCode) {
						case 0:
							// This should be handled as success above, but just in case
							isSuccess = true;
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
			}

			// Always refresh status after action and determine actual success
			return new Promise(function(resolve) {
				setTimeout(function() {
					self.refreshServiceStatus().then(function(statusRes) {
						// Service status verification completed
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
		});
	},

	refreshServiceStatus: function() {
		var self = this;
		
		return callServiceStatus().then(function(res) {
			// Get enabled status from UCI (not from service status)
			var sections = uci.sections('ewsvpnc', 'ewsvpnc');
			var isEnabled = false;
			if (sections && sections.length > 0) {
				isEnabled = sections[0].enabled === '1';
			}
			
			// Update serviceInfo object
			self.serviceInfo.running = res.running || false;
			self.serviceInfo.enabled = isEnabled;
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
				self.statusElements.enabledText.textContent = self.serviceInfo.enabled ? _('Yes') : _('No');
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
		try {
			var els = this.statusElements;
			
			// Update config file settings display (from configFileData)
			if (els.serverText) {
				var addr = self.configFileData.serv_addr || '172.16.130.26';
				var port = self.configFileData.serv_port || '443';
				els.serverText.textContent = addr + ':' + port;
			}
			
			if (els.userText) {
				els.userText.textContent = self.configFileData.user_id || 'user01';
			}
			
			if (els.homeDirText) {
				els.homeDirText.textContent = self.configFileData.home_dir || '/etc/ewsvpnc';
			}
			
			// Update Auto Start status (from UCI)
			var sections = uci.sections('ewsvpnc', 'ewsvpnc');
			if (sections && sections.length > 0) {
				var cfg = sections[0];
				if (els.enabledText) {
					var isEnabled = cfg.enabled === '1';
					els.enabledText.textContent = isEnabled ? _('Yes') : _('No');
				}
			}
		} catch (err) {
			console.error('Config display update error:', err.message);
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
		var self = this;
		
		// Load UCI first, then everything else
		return uci.load('ewsvpnc').then(function() {
			return Promise.all([
				self.refreshServiceStatus(),
				fs.read('/etc/ewsvpnc/ewsvpnc.conf').then(function(content) {
					if (content) {
						var config = parseConfigFile(content);
						// Store config file data separately (not in UCI)
						self.configFileData = config;
					}
				}).catch(function(err) {
					console.error('Failed to read config file:', err);
				})
			]);
		});
	},

	render: function() {
		var self = this;
		
		// Add styles first
		addStyles();
		
		var m = new form.Map('ewsvpnc', _('EWS VPN Client Manager'));
		
		// Store reference to map for save/reset handlers
		this.map = m;

		// Create main section with tabs
		var s = m.section(form.TypedSection, 'ewsvpnc', _('EWS VPN Configuration'));
		s.anonymous = true;
		s.addremove = false;
		
		// Ensure config file data is available, with fallback
		if (!self.configFileData) {
			self.configFileData = {};
		}
		
		// Standard load function - don't modify UCI during load
		s.load = function() {
			return form.TypedSection.prototype.load.apply(this, arguments);
		};

		// Add tabs
		s.tab('service', _('Service Control'));
		s.tab('config', _('VPN Configuration'));

		// Service Control Tab
		var serviceControlOption = s.taboption('service', form.DummyValue, '_service_control', '', '');
		serviceControlOption.renderWidget = function() {
			var versionInfo = E('div', { 'class': 'ewsvpn-version-info' }, [
				E('p', {}, [
					E('span', {}, ''),  // Version info will be filled dynamically
					E('br'),
					E('span', {}, '')   // API version will be filled dynamically
				])
			]);

			// Get version information
			callVPNVersion().then(function(res) {
				if (res.version && res.api_version) {
					versionInfo.querySelector('span:first-child').textContent = 
						`eWalker SSL VPN v10 Client for Linux (v${res.version})`;
					versionInfo.querySelector('span:last-child').textContent = 
						`API Version: ${res.api_version}`;
				}
			}).catch(function(err) {
				console.log('Failed to get VPN version, using default version:', err);
			});

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
				versionInfo,
				statusDiv,
				btnDiv,
				infoDiv
			]);
		};

		// VPN Configuration Tab
		// Get current UCI values to preserve them
		var sections = uci.sections('ewsvpnc', 'ewsvpnc');
		var currentUCI = sections && sections.length > 0 ? sections[0] : {};
		
		// UCI field for 'enabled' only - normal UCI behavior
		var o = s.taboption('config', form.Flag, 'enabled', _('Auto Start'));
		o.rmempty = false;
		o.default = currentUCI.enabled || '0';
		
		// Create UCI section if it doesn't exist
		if (!currentUCI || Object.keys(currentUCI).length === 0) {
			var sectionName = uci.add('ewsvpnc', 'ewsvpnc');
			uci.set('ewsvpnc', sectionName, 'enabled', '0');
			uci.set('ewsvpnc', sectionName, 'config_file', '/etc/ewsvpnc/ewsvpnc.conf');
			uci.set('ewsvpnc', sectionName, 'home_dir', '/etc/ewsvpnc');
			currentUCI = {
				enabled: '0',
				config_file: '/etc/ewsvpnc/ewsvpnc.conf',
				home_dir: '/etc/ewsvpnc'
			};
		}

		// Create custom container for config file fields
		var configFileSection = s.taboption('config', form.DummyValue, '_config_file_fields', '', '');
		configFileSection.renderWidget = function() {
			var container = E('div', { 'class': 'cbi-section-node' });
			
			// Home Directory
			var homeDirDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Home Directory')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'value': self.configFileData.home_dir || '/etc/ewsvpnc',
						'data-field': 'home_dir',
						'change': function(ev) {
							var oldValue = self.configFileData.home_dir || '/etc/ewsvpnc';
							var newValue = ev.target.value;
							if (oldValue !== newValue) {
								self.configFileData.home_dir = newValue;
								self.markConfigChanged();
							}
						}
					})
				])
			]);
			
			// Client Type
			var clientTypeDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Client Type')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('select', {
						'class': 'cbi-input-select',
						'data-field': 'client_type',
						'change': function(ev) {
							var oldValue = self.configFileData.client_type || '2';
							var newValue = ev.target.value;
							if (oldValue !== newValue) {
								self.configFileData.client_type = newValue;
								self.markConfigChanged();
							}
						}
					}, [
						E('option', { 'value': '1' }, _('TLC (Linux Normal)')),
						E('option', { 'value': '2', 'selected': true }, _('TLE (Linux Embedded)'))
					])
				])
			]);
			
			// Server Address
			var servAddrDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Server Address')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'value': self.configFileData.serv_addr || '172.16.130.26',
						'data-field': 'serv_addr',
						'change': function(ev) {
							var oldValue = self.configFileData.serv_addr || '172.16.130.26';
							var newValue = ev.target.value;
							if (oldValue !== newValue) {
								self.configFileData.serv_addr = newValue;
								self.markConfigChanged();
							}
						}
					})
				])
			]);
			
			// Server Port
			var servPortDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Server Port')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', {
						'type': 'number',
						'class': 'cbi-input-text',
						'value': self.configFileData.serv_port || '443',
						'data-field': 'serv_port',
						'change': function(ev) {
							var oldValue = self.configFileData.serv_port || '443';
							var newValue = ev.target.value;
							if (oldValue !== newValue) {
								self.configFileData.serv_port = newValue;
								self.markConfigChanged();
							}
						}
					})
				])
			]);
			
			// User ID
			var userIdDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('User ID')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'value': self.configFileData.user_id || 'user01',
						'data-field': 'user_id',
						'change': function(ev) {
							var oldValue = self.configFileData.user_id || 'user01';
							var newValue = ev.target.value;
							if (oldValue !== newValue) {
								self.configFileData.user_id = newValue;
								self.markConfigChanged();
							}
						}
					})
				])
			]);
			
			// Password
			var passwordInput = E('input', {
				'type': 'password',
				'class': 'cbi-input-text',
				'value': self.configFileData.user_passwd || '',
				'data-field': 'user_passwd',
				'style': 'padding-right: 40px;',
				'change': function(ev) {
					var oldValue = self.configFileData.user_passwd || '';
					var newValue = ev.target.value;
					if (oldValue !== newValue) {
						self.configFileData.user_passwd = newValue;
						self.markConfigChanged();
					}
				}
			});
			
			var toggleButton = E('button', {
				'type': 'button',
				'class': 'cbi-button',
				'style': 'position: absolute; right: 5px; top: 50%; transform: translateY(-50%); padding: 4px 8px; font-size: 12px; border: none; background: #f0f0f0; cursor: pointer;',
				'title': _('Toggle password visibility'),
				'click': function(ev) {
					ev.preventDefault();
					if (passwordInput.type === 'password') {
						passwordInput.type = 'text';
						this.textContent = '🙈';
						this.title = _('Hide password');
					} else {
						passwordInput.type = 'password';
						this.textContent = '👁';
						this.title = _('Show password');
					}
				}
			}, '👁');
			
			var passwdDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Password')),
				E('div', { 'class': 'cbi-value-field', 'style': 'position: relative;' }, [
					passwordInput,
					toggleButton
				])
			]);
			
			// Force Login
			var forceLoginDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Force Login')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', {
						'type': 'checkbox',
						'class': 'cbi-input-checkbox',
						'checked': (self.configFileData.force_login === '1'),
						'data-field': 'force_login',
						'change': function(ev) {
							var oldValue = self.configFileData.force_login || '0';
							var newValue = ev.target.checked ? '1' : '0';
							if (oldValue !== newValue) {
								self.configFileData.force_login = newValue;
								self.markConfigChanged();
							}
						}
					})
				])
			]);
			
			// Auto Retry
			var retryLoginDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Auto Retry')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', {
						'type': 'checkbox',
						'class': 'cbi-input-checkbox',
						'checked': (self.configFileData.retry_login === '1'),
						'data-field': 'retry_login',
						'change': function(ev) {
							var oldValue = self.configFileData.retry_login || '0';
							var newValue = ev.target.checked ? '1' : '0';
							if (oldValue !== newValue) {
								self.configFileData.retry_login = newValue;
								self.markConfigChanged();
							}
						}
					})
				])
			]);
			
			// Log Level
			var logLevelDiv = E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Log Level')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('select', {
						'class': 'cbi-input-select',
						'data-field': 'log_level',
						'change': function(ev) {
							var oldValue = self.configFileData.log_level || '4';
							var newValue = ev.target.value;
							if (oldValue !== newValue) {
								self.configFileData.log_level = newValue;
								self.markConfigChanged();
							}
						}
					}, [
						E('option', { 'value': '0' }, _('Quiet (0)')),
						E('option', { 'value': '3' }, _('Error (3)')),
						E('option', { 'value': '4', 'selected': true }, _('Warning (4)')),
						E('option', { 'value': '5' }, _('Notice (5)')),
						E('option', { 'value': '6' }, _('Info (6)')),
						E('option', { 'value': '7' }, _('Debug (7)'))
					])
				])
			]);
			
			container.appendChild(homeDirDiv);
			container.appendChild(clientTypeDiv);
			container.appendChild(servAddrDiv);
			container.appendChild(servPortDiv);
			container.appendChild(userIdDiv);
			container.appendChild(passwdDiv);
			container.appendChild(forceLoginDiv);
			container.appendChild(retryLoginDiv);
			container.appendChild(logLevelDiv);
			
			// Store reference to update values later
			self.configFileElements = container;
			
			return container;
		};

		// Override map save to handle both UCI and config file
		var originalSave = m.save;
		m.save = function() {
			var hasConfigFileChanges = self.configChanged;
			
			// Preserve UCI fields before save
			var sections = uci.sections('ewsvpnc', 'ewsvpnc');
			var currentUCI = sections && sections.length > 0 ? sections[0] : {};
			
			return originalSave.apply(this, arguments).then(function(result) {
				
				// Ensure UCI structure is preserved after save
				var postSaveSections = uci.sections('ewsvpnc', 'ewsvpnc');
				if (postSaveSections && postSaveSections.length > 0) {
					var section = postSaveSections[0];
					var needsRestore = false;
					
					// Restore missing UCI fields if they were deleted
					if (!section.config_file) {
						uci.set('ewsvpnc', section['.name'], 'config_file', currentUCI.config_file || '/etc/ewsvpnc/ewsvpnc.conf');
						needsRestore = true;
					}
					if (!section.home_dir) {
						var homeDirValue = currentUCI.home_dir || self.configFileData.home_dir || '/etc/ewsvpnc';
						uci.set('ewsvpnc', section['.name'], 'home_dir', homeDirValue);
						needsRestore = true;
					}
					
					// If we restored fields, commit the changes
					if (needsRestore) {
						return uci.save().then(function() {
							return result;
						});
					}
				}
				
				// Save config file only if there are changes
				if (hasConfigFileChanges) {
					return self.saveConfigFile().then(function() {
						self.configChanged = false;
						return result;
					});
				}
				
				return result;
			}).catch(function(err) {
				console.error('Save failed:', err.message);
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
				self.updateStatusDisplay();
				self.updateConfigDisplay();
				self.updateConfigFileFields(); // Update config file form fields
			});

			return mapEl;
		});
	},


	markConfigChanged: function() {
		this.configChanged = true;
		
		// Force UCI change detection by setting a timestamp field in UCI
		var sections = uci.sections('ewsvpnc', 'ewsvpnc');
		if (sections && sections.length > 0) {
			var section = sections[0];
			// Set a timestamp to force change detection in UCI
			uci.set('ewsvpnc', section['.name'], '_last_config_change', Date.now().toString());
		}
		
		// Also set map changed flag
		if (this.map) {
			this.map.changed = true;
		}
	},

	updateConfigFileFields: function() {
		var self = this;
		if (!self.configFileElements) return;
		
		// Update all input values from configFileData
		var inputs = self.configFileElements.querySelectorAll('input, select');
		inputs.forEach(function(input) {
			var field = input.getAttribute('data-field');
			if (field) {
				if (input.type === 'checkbox') {
					// For checkboxes, always set the state (false if undefined)
					input.checked = (self.configFileData[field] === '1');
				} else if (self.configFileData[field] !== undefined) {
					if (input.tagName === 'SELECT') {
						// For select elements, set the selected option
						var value = self.configFileData[field];
						for (var i = 0; i < input.options.length; i++) {
							if (input.options[i].value === value) {
								input.selectedIndex = i;
								break;
							}
						}
					} else {
						input.value = self.configFileData[field];
					}
				}
			}
		});
	},

	saveConfigFile: function() {
		var self = this;
		
		// Use configFileData for config file settings
		var confContent = [
			'# For more information, refer README.txt!',
			'',
			'home_dir=' + (self.configFileData.home_dir || '/etc/ewsvpnc'),
			'client_type=' + (self.configFileData.client_type || '2'),
			'#os_name=Linux',
			'#process_name=svpnc',
			'#vir_dev_name=tun',
			'serv_addr=' + (self.configFileData.serv_addr || '172.16.130.26'),
			'serv_port=' + (self.configFileData.serv_port || '443'),
			'user_id=' + (self.configFileData.user_id || 'user01'),
			'user_passwd=' + (self.configFileData.user_passwd || ''),
			'force_login=' + (self.configFileData.force_login === '1' ? 'yes' : 'no'),
			'retry_login=' + (self.configFileData.retry_login === '1' ? 'yes' : 'no'),
			'log_level=' + (self.configFileData.log_level || '4'),
			'#log_size=1048576',
			'#log_count=4',
			'#log_rotate_interval=10',
			''
		].join('\n');

		// Save to ewsvpnc.conf (only config file settings, not 'enabled')
		return fs.write('/etc/ewsvpnc/ewsvpnc.conf', confContent).then(function() {
			// Update displays
			self.updateConfigDisplay();
			
			// Restart if running to apply new settings
			if (self.serviceInfo.running) {
				return self.handleServiceAction('reload');
			}
		});
	},


	handleSave: function() {
		var self = this;
		
		// First save UCI changes (enabled field and hidden fields)
		return this.map.save().then(function() {
			// Then save config file if there are changes
			if (self.configChanged) {
				return self.saveConfigFile().then(function() {
					self.configChanged = false;
				});
			}
		}).catch(function(err) {
			console.error('Save error:', err);
			throw err;
		});
	},

	destroy: function() {
		if (this.pollFn) {
			poll.remove(this.pollFn);
			this.pollFn = null;
		}
	}
});
