<?php
/**
 * Plugin Name: Pre Installer
 * Description: Automatically installs WordPress when first booted.
 * Version: 1.0.0
 * Author: Nur
 * Author URI: https://nuralam.com
 * License: GPLv2 or later
 * Text Domain: pre-installer
 * Domain Path: /languages
 *
 * @package PreInstaller
 */

if ( defined( 'WP_INSTALLING' ) && WP_INSTALLING ) {
	return;
}

if ( file_exists( ABSPATH . 'wp-config.php' ) && ! is_blog_installed() ) {
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	require_once ABSPATH . 'wp-includes/wp-db.php';
	require_once ABSPATH . 'wp-includes/pluggable.php';

	$blog_title  = getenv( 'WP_SITE_TITLE' ) ?: 'Demo Site';
	$admin_user  = getenv( 'WP_ADMIN_USER' ) ?: 'admin';
	$admin_pass  = getenv( 'WP_ADMIN_PASS' ) ?: 'password';
	$admin_email = getenv( 'WP_ADMIN_EMAIL' ) ?: 'admin@example.com';
	$public      = 1;

	wp_install( $blog_title, $admin_user, $admin_email, $public, '', $admin_pass );

	if ( $url = getenv( 'WP_SITE_URL' ) ) {
		update_option( 'siteurl', $url );
		update_option( 'home', $url );
	}

	include_once ABSPATH . 'wp-admin/includes/plugin.php';
	$plugins_to_activate = array( 
		'classic-editor/classic-editor.php', 
		'contact-form-7/wp-contact-form-7.php',
		'tutor/tutor.php'
	);
	foreach ( $plugins_to_activate as $plugin_file ) {
		if ( file_exists( WP_PLUGIN_DIR . '/' . $plugin_file ) ) {
			activate_plugin( $plugin_file );
		}
	}

	wp_clear_auth_cookie();
	wp_set_auth_cookie( 1 );
	wp_redirect( admin_url() );
	exit;
}
