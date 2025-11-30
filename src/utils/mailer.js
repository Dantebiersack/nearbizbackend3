// utils/mailer.js
const nodemailer = require("nodemailer");

// Configuración del transportador de correo usando Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "nearbizcompany@gmail.com",
    pass: process.env.APP_PASSWORD, // tu app password va en .env
  },
});

// Función para enviar correos
async function enviarCorreo(destinatario, asunto, mensajeHtml) {
  const mailOptions = {
    from: '"NearBiz Company" <nearbizcompany@gmail.com>', // remitente
    to: destinatario, // destinatario
    subject: asunto, // asunto del correo
    html: mensajeHtml, // cuerpo en HTML
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Correo enviado:", info.response);
  } catch (error) {
    console.error("Error al enviar correo:", error);
    throw error; // lanzamos error para manejarlo en el controlador
  }
}

// Exportamos la función para usarla en los controladores
module.exports = { enviarCorreo };
