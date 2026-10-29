// Fill these in once the LLC and support email exist. Both legal pages read from here.
window.MN_LEGAL={company:"[Company name], LLC",email:"[support email]",state:"Georgia",effective:"October 29, 2026",version:"2026-10-29"};
document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll("[data-l]").forEach(e=>{const k=e.getAttribute("data-l");e.textContent=window.MN_LEGAL[k];if(k==="email"&&/@/.test(window.MN_LEGAL.email)&&e.tagName==="A")e.href="mailto:"+window.MN_LEGAL.email})});
