# Lets the server reach the code and its releases on GitHub once the
# repository is private. Sourced by update.sh, fetch-data.sh and fetch-apk.sh.
#
# GITHUB_READ_TOKEN in server/.env: a fine-grained personal access token for
# this repository only, with "Contents: Read-only" and nothing else
# (DEPLOY.md, "Making the repository private"). Empty or missing while the
# repository is public: then nothing changes.
#
#   github_auth path/to/.env
#
# sets, for the rest of the script:
#   - git: an Authorization header for github.com, through GIT_CONFIG_* in
#     the environment, so the token is never written into .git/config;
#   - GH_CURL_AUTH: curl arguments for api.github.com (an empty array without
#     a token);
#   - GH_TOKEN_SET: 1 with a token, 0 without.

github_auth() {
  local token
  token=$( (grep -E '^GITHUB_READ_TOKEN=' "$1" 2>/dev/null || true) | tail -n 1 | cut -d= -f2-)
  GH_CURL_AUTH=()
  GH_TOKEN_SET=0
  [ -n "$token" ] || return 0
  GH_TOKEN_SET=1
  GH_CURL_AUTH=(-H "Authorization: Bearer $token" -H "X-GitHub-Api-Version: 2022-11-28")
  export GIT_CONFIG_COUNT=1
  export GIT_CONFIG_KEY_0=http.https://github.com/.extraheader
  GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')"
  export GIT_CONFIG_VALUE_0
}
