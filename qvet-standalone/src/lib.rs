use axum::routing::get;
use axum::Router;
use qvet_api::api_app;
use qvet_api::github_oauth2_client;
use axum_extra::extract::cookie::Key;

mod static_file_handler;

pub fn wrapped_api(client_id: String, client_secret: String, cookie_key: Key) -> anyhow::Result<Router> {
    let app = api_app(github_oauth2_client(client_id, client_secret)?, cookie_key);
    Ok(wrap_api(app))
}

pub fn wrap_api(api: Router) -> Router {
    Router::new()
        .nest("/api", api)
        .route("/*path", get(static_file_handler::static_path))
        .route("/", get(static_file_handler::static_index))
}
