<?php
/**
 * Plugin Name: Auto Login
 * Description: Provides temporary auto-login links for demo sites
 * Version: 1.0
 * 
 */

// Create auto-login endpoint
add_action(
	'init',
	function () {
		if ( isset( $_GET['auto_login_token'] ) ) {
			$token = sanitize_text_field( $_GET['auto_login_token'] );

			// Get stored token
			$stored_token = get_option( 'auto_login_token' );
			$token_expiry = get_option( 'auto_login_token_expiry' );

			// Check if token is valid and not expired
			if ( $stored_token && $token === $stored_token && time() < $token_expiry ) {
				// Get admin user
				$admin_user = get_users(
					array(
						'role'   => 'administrator',
						'number' => 1,
					)
				);

				if ( ! empty( $admin_user ) ) {
					// Log in the user
					wp_set_current_user( $admin_user[0]->ID );
					wp_set_auth_cookie( $admin_user[0]->ID, true );

					// Delete the token after use
					delete_option( 'auto_login_token' );
					delete_option( 'auto_login_token_expiry' );

					// Redirect to admin dashboard
					wp_redirect( admin_url() );
					exit;
				}
			}

			// Invalid or expired token
			wp_die( 'Invalid or expired login link. Please use the admin credentials to log in manually.' );
		}
	}
);

// Generate auto-login token after WordPress installation
add_action(
	'wp_loaded',
	function () {
		// Only generate token if it doesn't exist and WordPress is installed
		if ( is_blog_installed() && ! get_option( 'auto_login_token' ) ) {
			$token = bin2hex( random_bytes( 32 ) );
			update_option( 'auto_login_token', $token );
			// Token expires in 1 hour
			update_option( 'auto_login_token_expiry', time() + 3600 );
		}
	}
);
