/**
 * Estado global do sysUser fora do React.
 * Permite que o handler de erros em main.tsx verifique se há um
 * usuário de unidade logado sem precisar acessar o contexto React.
 *
 * O SysUserProvider atualiza este estado quando carrega o sysUser.
 */

let _isSysUserLoaded = false;
let _hasSysUser = false;

export function setSysUserGlobalState(hasSysUser: boolean) {
  _isSysUserLoaded = true;
  _hasSysUser = hasSysUser;
}

export function isSysUserAuthenticated(): boolean {
  return _hasSysUser;
}

export function isSysUserStateLoaded(): boolean {
  return _isSysUserLoaded;
}
