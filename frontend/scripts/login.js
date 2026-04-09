// ============================================================
// LOGIN.JS — Tela de login
// Autentica o usuário via POST /auth/login e salva o token
// no sessionStorage (some ao fechar a aba).
// ============================================================

import { api } from './api.js';

// Inicializa a tela de login com listeners de teclado e clique.
export function initLogin(onSuccess) {
  const btnLogin = document.getElementById('btn-login');
  const loginInput = document.getElementById('login-input');
  const senhaInput = document.getElementById('senha-input');
  const erroEl = document.getElementById('login-erro');

  // Foca automaticamente no campo de login
  loginInput?.focus();

  // Permite enviar com Enter nos dois campos
  const handleEnter = (e) => { if (e.key === 'Enter') handleLogin(); };
  loginInput?.addEventListener('keydown', handleEnter);
  senhaInput?.addEventListener('keydown', handleEnter);
  btnLogin?.addEventListener('click', handleLogin);

  // Realiza o login: valida campos, chama API, salva token e chama onSuccess.
  async function handleLogin() {
    const login = loginInput?.value.trim();
    const senha = senhaInput?.value;

    if (!login || !senha) {
      erroEl?.classList.remove('hidden');
      erroEl.textContent = 'Preencha login e senha';
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Entrando...';
    erroEl?.classList.add('hidden');

    try {
      const resultado = await api.login(login, senha);
      sessionStorage.setItem('smartline_token', resultado.token);
      sessionStorage.setItem('smartline_usuario', JSON.stringify(resultado.usuario));
      onSuccess(resultado.usuario);
    } catch (err) {
      erroEl.textContent = err.message || 'Login ou senha incorretos';
      erroEl?.classList.remove('hidden');
      senhaInput.value = '';
      senhaInput?.focus();
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Entrar';
    }
  }
}