#
# Copyright (C) 2010-2015 OpenWrt.org
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=ewsvpnc

PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_SOURCE_URL:=
PKG_SOURCE:=
PKG_HASH:=cddddaa74eafeae5ed556d24cba598aa943626007ee46399fb1998abd0cd342e

include $(INCLUDE_DIR)/package.mk

define Package/ewsvpnc
	TITLE:=eWalker SSL VPN Client
	SECTION:=net
	CATEGORY:=Network
	SUBMENU:=VPN
	MENU:=1
	PROVIDES:=XNsystems
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) ./ewsvpnc $(PKG_BUILD_DIR)/
endef

define Build/Compile
endef

define Package/ewsvpnc/conffiles
/etc/config/ewsvpnc
/etc/ewsvpnc.user
endef

define Package/ewsvpnc/install
	$(INSTALL_DIR) \
		$(1)/usr/sbin \
		$(1)/etc/init.d \
		$(1)/etc/config

	$(INSTALL_BIN) \
		$(PKG_BUILD_DIR)/ewsvpnc \
		$(1)/usr/sbin/

	$(INSTALL_BIN) \
		files/ewsvpnc.init \
		$(1)/etc/init.d/ewsvpnc

	$(INSTALL_DATA) \
		files/ewsvpnc.user \
		$(1)/etc/ewsvpnc.user
endef

$(eval $(call BuildPackage,ewsvpnc))
