package me.atri.utils

import me.atri.data.model.Attachment
import me.atri.data.model.AttachmentType

/**
 * 提供表情名到图片地址的映射，以及便捷的附件构造。
 * URL 先占位，后续把实际上传后的地址替换进来即可。
 */
object EmojiAssets {
    // TODO: 将这些占位地址替换为你上传后的真实表情包 URL
    private val emojiUrls: Map<String, String> = mapOf(
        "冷漠" to "https://your domain/你的R2仓库中对应的表情包名称",
           )

    fun createEmojiAttachmentOrNull(name: String): Attachment? {
        val url = emojiUrls[name] ?: return null
        return Attachment(
            type = AttachmentType.IMAGE,
            url = url,
            mime = "image/jpeg",
            name = name,
            sizeBytes = null
        )
    }
}
